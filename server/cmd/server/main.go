package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"quakescope/server/internal/quake"
	"strconv"
	"syscall"
	"time"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	cache := quake.NewCache()
	client := &http.Client{Timeout: 20 * time.Second}
	for _, source := range []string{"usgs", "bmkg"} {
		go func(source string) {
			poll := func() {
				var all []quake.Event
				var failure error
				urls := []string{"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson", "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson"}
				parse := quake.ParseUSGS
				if source == "bmkg" {
					parse = quake.ParseBMKG
					urls = []string{"https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json", "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json", "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json"}
				}
				for _, url := range urls {
					events, err := quake.Fetch(ctx, client, url, parse)
					if err != nil {
						failure = err
						break
					}
					all = append(all, events...)
				}
				cache.Update(source, all, failure, time.Now().UTC())
				if failure != nil {
					slog.Warn("provider sync failed", "source", source, "error", failure)
				} else {
					slog.Info("provider synchronized", "source", source, "events", len(all))
				}
			}
			poll()
			ticker := time.NewTicker(4 * time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					poll()
				}
			}
		}(source)
	}
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	write := func(w http.ResponseWriter, status int, v any) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(v)
	}
	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) { write(w, 200, map[string]string{"status": "ok"}) })
	r.Get("/api/v1/sources/status", func(w http.ResponseWriter, r *http.Request) {
		_, status := cache.Read("all", time.Now())
		write(w, 200, map[string]any{"sources": status})
	})
	r.Get("/api/v1/earthquakes", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		source := q.Get("source")
		if source == "" {
			source = "usgs"
		}
		tr := q.Get("timeRange")
		if tr == "" {
			tr = "24h"
		}
		window := 24 * time.Hour
		if tr == "7d" {
			window *= 7
		}
		min := 2.5
		limit := 1000
		var err error
		if q.Has("minMagnitude") {
			min, err = strconv.ParseFloat(q.Get("minMagnitude"), 64)
		}
		if err != nil || !(min >= 0 && min <= 10.5) || (source != "all" && source != "usgs" && source != "bmkg") || (tr != "24h" && tr != "7d") {
			write(w, 400, map[string]string{"error": "invalid filters"})
			return
		}
		if q.Has("limit") {
			limit, err = strconv.Atoi(q.Get("limit"))
		}
		if err != nil || limit < 1 || limit > 1000 {
			write(w, 400, map[string]string{"error": "limit must be 1–1000"})
			return
		}
		now := time.Now().UTC()
		events, status := cache.Read(source, now)
		events = quake.Filter(events, source, window, min, now)
		total := len(events)
		if total > limit {
			events = events[:limit]
		}
		write(w, 200, map[string]any{"events": events, "total": total, "returned": len(events), "truncated": total > limit, "filters": map[string]any{"source": source, "timeRange": tr, "minMagnitude": min, "limit": limit}, "freshness": status})
	})
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}
	srv := &http.Server{Addr: addr, Handler: r, ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		slog.Info("server listening", "address", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdown)
}
