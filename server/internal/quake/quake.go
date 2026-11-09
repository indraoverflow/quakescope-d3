package quake

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Event struct {
	ID        string     `json:"id"`
	Source    string     `json:"source"`
	SourceID  string     `json:"sourceId"`
	Latitude  float64    `json:"latitude"`
	Longitude float64    `json:"longitude"`
	Magnitude float64    `json:"magnitude"`
	Depth     float64    `json:"depthKm"`
	Location  string     `json:"location"`
	Occurred  time.Time  `json:"occurredAt"`
	Updated   *time.Time `json:"updatedAt,omitempty"`
	Felt      string     `json:"felt,omitempty"`
	Tsunami   string     `json:"tsunamiInformation,omitempty"`
	URL       string     `json:"detailUrl,omitempty"`
}
type Status struct {
	Source  string     `json:"source"`
	Success *time.Time `json:"lastSuccessfulSync,omitempty"`
	Attempt *time.Time `json:"lastAttemptedSync,omitempty"`
	Stale   bool       `json:"stale"`
	Error   string     `json:"error,omitempty"`
}
type Snapshot struct {
	Events []Event
	Status Status
}
type Cache struct {
	mu        sync.RWMutex
	snapshots map[string]Snapshot
}

func NewCache() *Cache {
	return &Cache{snapshots: map[string]Snapshot{"usgs": {Status: Status{Source: "usgs", Stale: true}}, "bmkg": {Status: Status{Source: "bmkg", Stale: true}}}}
}
func (c *Cache) Update(source string, events []Event, err error, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	s := c.snapshots[source]
	s.Status.Attempt = &now
	s.Status.Stale = err != nil
	if err != nil {
		s.Status.Error = err.Error()
	} else {
		s.Events = Dedup(events)
		s.Status.Success = &now
		s.Status.Error = ""
	}
	c.snapshots[source] = s
}
func (c *Cache) Read(source string, now time.Time) ([]Event, []Status) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	events := []Event{}
	statuses := []Status{}
	for _, key := range []string{"usgs", "bmkg"} {
		if source != "all" && source != key {
			continue
		}
		s := c.snapshots[key]
		st := s.Status
		st.Stale = st.Stale || st.Success == nil || now.Sub(*st.Success) > 10*time.Minute
		statuses = append(statuses, st)
		events = append(events, s.Events...)
	}
	return events, statuses
}
func Dedup(events []Event) []Event {
	out := []Event{}
	indices := map[string]int{}
	for _, e := range events {
		if e.SourceID == "" || e.Occurred.IsZero() || !(e.Latitude >= -90 && e.Latitude <= 90 && e.Longitude >= -180 && e.Longitude <= 180 && e.Magnitude >= 0 && e.Magnitude <= 10.5 && e.Depth >= -10 && e.Depth <= 1000) {
			continue
		}
		if i, ok := indices[e.ID]; ok {
			if out[i].Felt == "" {
				out[i].Felt = e.Felt
			}
			if out[i].Tsunami == "" {
				out[i].Tsunami = e.Tsunami
			}
			continue
		}
		indices[e.ID] = len(out)
		out = append(out, e)
	}
	return out
}
func Filter(events []Event, source string, window time.Duration, min float64, now time.Time) []Event {
	out := []Event{}
	for _, e := range events {
		if (source == "all" || e.Source == source) && e.Magnitude >= min && !e.Occurred.Before(now.Add(-window)) && !e.Occurred.After(now) {
			out = append(out, e)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Occurred.After(out[j].Occurred) })
	return out
}
func ParseUSGS(b []byte) ([]Event, error) {
	var root struct {
		Features []json.RawMessage `json:"features"`
	}
	if err := json.Unmarshal(b, &root); err != nil {
		return nil, err
	}
	if root.Features == nil {
		return nil, fmt.Errorf("missing features")
	}
	out := []Event{}
	for _, raw := range root.Features {
		var f struct {
			ID         string `json:"id"`
			Properties struct {
				Mag     *float64 `json:"mag"`
				Place   string   `json:"place"`
				Time    int64    `json:"time"`
				Updated int64    `json:"updated"`
				URL     string   `json:"url"`
				Tsunami *int     `json:"tsunami"`
			} `json:"properties"`
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
		}
		if json.Unmarshal(raw, &f) != nil || len(f.Geometry.Coordinates) < 3 || f.Properties.Mag == nil || f.Properties.Time <= 0 {
			continue
		}
		p := f.Properties
		c := f.Geometry.Coordinates
		e := Event{ID: "usgs:" + f.ID, Source: "usgs", SourceID: f.ID, Latitude: c[1], Longitude: c[0], Depth: c[2], Magnitude: *p.Mag, Location: p.Place, Occurred: time.UnixMilli(p.Time).UTC(), URL: p.URL}
		if p.Updated > 0 {
			t := time.UnixMilli(p.Updated).UTC()
			e.Updated = &t
		}
		if p.Tsunami != nil {
			e.Tsunami = fmt.Sprintf("USGS tsunami flag: %d (not an official tsunami warning)", *p.Tsunami)
		}
		out = append(out, e)
	}
	return Dedup(out), nil
}
func ParseBMKG(b []byte) ([]Event, error) {
	var root struct {
		Info struct {
			Gempa json.RawMessage `json:"gempa"`
		} `json:"Infogempa"`
	}
	if err := json.Unmarshal(b, &root); err != nil {
		return nil, err
	}
	raw := root.Info.Gempa
	if len(raw) == 0 {
		return nil, fmt.Errorf("missing gempa")
	}
	var rows []json.RawMessage
	if raw[0] == 91 {
		if err := json.Unmarshal(raw, &rows); err != nil {
			return nil, err
		}
	} else {
		rows = []json.RawMessage{raw}
	}
	out := []Event{}
	for _, row := range rows {
		var p struct {
			Date        string `json:"DateTime"`
			Coordinates string `json:"Coordinates"`
			Magnitude   string `json:"Magnitude"`
			Depth       string `json:"Kedalaman"`
			Location    string `json:"Wilayah"`
			Felt        string `json:"Dirasakan"`
			Potential   string `json:"Potensi"`
		}
		if json.Unmarshal(row, &p) != nil {
			continue
		}
		t, err := time.Parse(time.RFC3339, p.Date)
		if err != nil {
			continue
		}
		xy := strings.Split(p.Coordinates, ",")
		if len(xy) != 2 {
			continue
		}
		lat, e1 := strconv.ParseFloat(strings.TrimSpace(xy[0]), 64)
		lng, e2 := strconv.ParseFloat(strings.TrimSpace(xy[1]), 64)
		mag, e3 := strconv.ParseFloat(p.Magnitude, 64)
		depth, e4 := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(p.Depth), "km")), 64)
		if e1 != nil || e2 != nil || e3 != nil || e4 != nil {
			continue
		}
		id := t.UTC().Format(time.RFC3339)
		out = append(out, Event{ID: "bmkg:" + id, Source: "bmkg", SourceID: id, Latitude: lat, Longitude: lng, Magnitude: mag, Depth: depth, Location: p.Location, Occurred: t.UTC(), Felt: p.Felt, Tsunami: p.Potential, URL: "https://data.bmkg.go.id/gempabumi/"})
	}
	return Dedup(out), nil
}
func Fetch(ctx context.Context, client *http.Client, url string, parse func([]byte) ([]Event, error)) ([]Event, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "QuakeScope/0.1")
	r, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return nil, fmt.Errorf("upstream HTTP %d", r.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(r.Body, 12*1024*1024+1))
	if err != nil {
		return nil, err
	}
	if len(b) > 12*1024*1024 {
		return nil, fmt.Errorf("upstream response too large")
	}
	events, err := parse(b)
	// A valid empty FeatureCollection is expected for quiet historical periods.
	return events, err
}
