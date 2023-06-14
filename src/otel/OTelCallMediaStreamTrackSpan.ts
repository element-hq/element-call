import { TrackStats } from "matrix-js-sdk/src/webrtc/stats/statsReport";
import opentelemetry, { Span } from "@opentelemetry/api";

import { ElementCallOpenTelemetry } from "./otel";

export class OTelCallMediaStreamTrackSpan {
  private readonly span: Span;
  private prev: TrackStats;

  public constructor(
    readonly oTel: ElementCallOpenTelemetry,
    readonly streamSpan: Span,
    data: TrackStats
  ) {
    const ctx = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      streamSpan
    );
    const options = {
      links: [
        {
          context: streamSpan.spanContext(),
        },
      ],
    };
    const type = `matrix.call.track.${data.label}.${data.kind}`;
    this.span = oTel.tracer.startSpan(type, options, ctx);
    this.span.setAttribute("track.trackId", data.id);
    this.span.setAttribute("track.kind", data.kind);
    this.span.setAttribute("track.constrainDeviceId", data.constrainDeviceId);
    this.span.setAttribute("track.settingDeviceId", data.settingDeviceId);
    this.span.setAttribute("track.label", data.label);

    this.span.addEvent("matrix.call.track.initState", {
      readyState: data.readyState,
      muted: data.muted,
      enabled: data.enabled,
    });
    this.prev = data;
  }

  public update(data: TrackStats): void {
    if (this.prev.muted !== data.muted) {
      this.span.addEvent("matrix.call.track.muted", { muted: data.muted });
    }
    if (this.prev.enabled !== data.enabled) {
      this.span.addEvent("matrix.call.track.enabled", {
        enabled: data.enabled,
      });
    }
    if (this.prev.readyState !== data.readyState) {
      this.span.addEvent("matrix.call.track.readyState", {
        readyState: data.readyState,
      });
    }
    this.prev = data;
  }

  public end(): void {
    this.span.end();
  }
}
