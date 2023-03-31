# OpenTelemetry Collector for development

This directory contains a docker compose file that starts a jaeger all-in-one instance
with an in-memory database, along with a standalone OpenTelemetry collector that forwards
traces into the jaeger. Jaeger has a built-in OpenTelemetry collector, but it can't be
configured to send CORS headers so can't be used from a browser. This sets the config on
the collector to send CORS headers.

This also adds an nginx to add CORS headers to the jaeger query endpoint, such that it can
be used from webapps like stalk (https://deniz.co/stalk/). The CORS enabled endpoint is
exposed on port 16687. To use stalk, you should simply be able to navigate to it and add
http://127.0.0.1:16687/api as a data source.

(Yes, we could enable the OTLP collector in jaeger all-in-one and passed this through
the nginx to enable CORS too, rather than running a separate collector. There's no reason
it's done this way other than that I'd already set up the separate collector.)

Running `docker compose up` in this directory should be all you need.
