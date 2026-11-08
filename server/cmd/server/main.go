package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"quakescope/server/internal/api"
	"quakescope/server/internal/quake"
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
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}
	srv := &http.Server{Addr: addr, Handler: api.Handler(cache), ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
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
