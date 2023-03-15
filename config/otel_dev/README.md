# OpenTelemetry Collector for development

This directory contains a docker compose file that starts a jaeger all-in-one instance
with an in-memory database, along with a standalong OpenTelemetry collector that forwards
traces into the jaeger. Jaeger has a built-in OpenTelemetry collector, but it can't be
configured to send CORS headers so can't be used from a browser. This sets the config on
the collector to send CORS headers.

Running `docker compose up` in this directory should be all you need.
