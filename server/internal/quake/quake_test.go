package quake

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestUSGS(t *testing.T) {
	events, err := ParseUSGS([]byte(`{"features":[{"id":"abc","properties":{"mag":4.5,"time":1794000000000,"tsunami":1},"geometry":{"coordinates":[120,-5,20]}},{"id":"bad","properties":{"mag":null}}]}`))
	if err != nil || len(events) != 1 {
		t.Fatalf("parse: %v %v", events, err)
	}
	e := events[0]
	if e.Longitude != 120 || e.Latitude != -5 || e.Depth != 20 || e.Tsunami == "" || e.Occurred.Location() != time.UTC {
		t.Fatal(e)
	}
}
func TestBMKG(t *testing.T) {
	raw := `{"Infogempa":{"gempa":[{"DateTime":"2026-11-08T15:00:00+07:00","Coordinates":"-6.1, 120.2","Magnitude":"5.1","Kedalaman":"10 km","Dirasakan":"III","Potensi":"Tidak berpotensi tsunami"},{"Magnitude":"bad"}]}}`
	events, err := ParseBMKG([]byte(raw))
	if err != nil || len(events) != 1 {
		t.Fatalf("parse: %v %v", events, err)
	}
	e := events[0]
	if e.Latitude != -6.1 || e.Longitude != 120.2 || e.Occurred.Hour() != 8 || e.Occurred.Location() != time.UTC || e.Felt != "III" {
		t.Fatal(e)
	}
	if len(Dedup(append(events, events...))) != 1 {
		t.Fatal("duplicate")
	}
	for _, b := range []string{`{}`, `broken`} {
		if _, err := ParseBMKG([]byte(b)); err == nil {
			t.Fatal("expected error")
		}
	}
}
func TestCacheAndFilter(t *testing.T) {
	now := time.Now().UTC()
	e := Event{ID: "usgs:a", Source: "usgs", SourceID: "a", Magnitude: 5, Occurred: now.Add(-time.Hour)}
	c := NewCache()
	c.Update("usgs", []Event{e}, nil, now)
	c.Update("usgs", nil, errors.New("offline"), now.Add(time.Minute))
	events, status := c.Read("usgs", now)
	if len(events) != 1 || !status[0].Stale || status[0].Success == nil || status[0].Error != "offline" {
		t.Fatal(events, status)
	}
	if len(Filter(events, "usgs", 24*time.Hour, 4.5, now)) != 1 || len(Filter(events, "bmkg", 24*time.Hour, 0, now)) != 0 || len(Filter(events, "all", time.Minute, 0, now)) != 0 || len(Filter(events, "all", 24*time.Hour, 6, now)) != 0 {
		t.Fatal("filter")
	}
	c.Update("usgs", events, nil, now)
	_, status = c.Read("usgs", now.Add(11*time.Minute))
	if !status[0].Stale {
		t.Fatal("age must expire")
	}
}
func TestProviderFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer server.Close()
	if _, err := Fetch(context.Background(), server.Client(), server.URL, ParseUSGS); err == nil {
		t.Fatal("expected HTTP error")
	}
}
