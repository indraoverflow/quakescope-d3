//go:build integration

package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"quakescope/server/internal/quake"
)

// Real HTTP transport, provider adapters, cache, and API; no live upstream access.
func TestProviderToAPI(t *testing.T) {
	now := time.Now().UTC()
	failed := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if failed {
			w.WriteHeader(503)
			return
		}
		if r.URL.Path == "/usgs" {
			fmt.Fprintf(w, `{"features":[{"id":"recent","properties":{"mag":5.2,"time":%d},"geometry":{"coordinates":[118,-5,12]}},{"id":"older","properties":{"mag":6,"time":%d},"geometry":{"coordinates":[110,-6,30]}}]}`, now.Add(-time.Hour).UnixMilli(), now.Add(-48*time.Hour).UnixMilli())
		} else {
			fmt.Fprintf(w, `{"Infogempa":{"gempa":{"DateTime":%q,"Coordinates":"-6, 120","Magnitude":"4.5","Kedalaman":"20 km","Wilayah":"Fixture Indonesia"}}}`, now.Add(-2*time.Hour).Format(time.RFC3339))
		}
	}))
	defer upstream.Close()
	cache := quake.NewCache()
	for _, source := range []string{"usgs", "bmkg"} {
		parser := quake.ParseUSGS
		if source == "bmkg" {
			parser = quake.ParseBMKG
		}
		events, err := quake.Fetch(context.Background(), upstream.Client(), upstream.URL+"/"+source, parser)
		if err != nil {
			t.Fatal(err)
		}
		cache.Update(source, events, nil, now)
	}
	api := httptest.NewServer(Handler(cache))
	defer api.Close()
	request := func(path string, status int, dst any) {
		t.Helper()
		res, err := api.Client().Get(api.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != status {
			t.Fatalf("%s: HTTP %d, want %d", path, res.StatusCode, status)
		}
		if dst != nil {
			if err := json.NewDecoder(res.Body).Decode(dst); err != nil {
				t.Fatal(err)
			}
		}
	}
	var result struct {
		Events          []quake.Event
		Total, Returned int
		Truncated       bool
		Freshness       []quake.Status
	}
	request("/api/v1/earthquakes?source=all&timeRange=24h&limit=1", 200, &result)
	if result.Total != 2 || result.Returned != 1 || !result.Truncated || result.Events[0].ID != "usgs:recent" {
		t.Fatalf("unexpected response: %+v", result)
	}
	request("/api/v1/earthquakes?source=bmkg&minMagnitude=4.5", 200, &result)
	if result.Total != 1 || result.Events[0].Latitude != -6 || result.Events[0].Longitude != 120 {
		t.Fatalf("normalization/filtering: %+v", result)
	}
	request("/api/v1/earthquakes?source=usgs&timeRange=7d&minMagnitude=6", 200, &result)
	if result.Total != 1 || result.Events[0].SourceID != "older" {
		t.Fatalf("time/magnitude filtering: %+v", result)
	}
	failed = true
	_, err := quake.Fetch(context.Background(), upstream.Client(), upstream.URL+"/usgs", quake.ParseUSGS)
	if err == nil {
		t.Fatal("expected upstream failure")
	}
	cache.Update("usgs", nil, err, now)
	request("/api/v1/earthquakes?source=usgs", 200, &result)
	if result.Total != 1 || !result.Freshness[0].Stale || result.Freshness[0].Error == "" {
		t.Fatalf("stale cache: %+v", result)
	}
	var sources struct{ Sources []quake.Status }
	request("/api/v1/sources/status", 200, &sources)
	if len(sources.Sources) != 2 || !sources.Sources[0].Stale {
		t.Fatal(sources)
	}
	request("/api/v1/health", 200, nil)
	for _, query := range []string{"source=invalid", "timeRange=1h", "limit=0", "limit=1001", "minMagnitude=NaN"} {
		request("/api/v1/earthquakes?"+query, 400, nil)
	}
}
