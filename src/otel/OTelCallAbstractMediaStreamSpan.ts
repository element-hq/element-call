import opentelemetry, { Span } from "@opentelemetry/api";
import { TrackStats } from "matrix-js-sdk/src/webrtc/stats/statsReport";

import { ElementCallOpenTelemetry } from "./otel";
import { OTelCallMediaStreamTrackSpan } from "./OTelCallMediaStreamTrackSpan";

type TrackId = string;

export abstract class OTelCallAbstractMediaStreamSpan {
  protected readonly trackSpans = new Map<
    TrackId,
    OTelCallMediaStreamTrackSpan
  >();
  public readonly span;

  public constructor(
    readonly oTel: ElementCallOpenTelemetry,
    readonly callSpan: Span,
    protected readonly type: string
  ) {
    const ctx = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      callSpan
    );
    const options = {
      links: [
        {
          context: callSpan.spanContext(),
        },
      ],
    };
    this.span = oTel.tracer.startSpan(this.type, options, ctx);
  }

  protected upsertTrackSpans(tracks: TrackStats[]) {
    let prvTracks: TrackId[] = [...this.trackSpans.keys()];
    tracks.forEach((t) => {
      if (!this.trackSpans.has(t.id)) {
        this.trackSpans.set(
          t.id,
          new OTelCallMediaStreamTrackSpan(this.oTel, this.span, t)
        );
      }
      this.trackSpans.get(t.id)?.update(t);
      prvTracks = prvTracks.filter((prvTrackId) => prvTrackId !== t.id);
    });

    prvTracks.forEach((prvTrackId) => {
      this.trackSpans.get(prvTrackId)?.end();
      this.trackSpans.delete(prvTrackId);
    });
  }

  public abstract update(data: Object): void;

  public end(): void {
    this.trackSpans.forEach((tSpan) => {
      tSpan.end();
    });
    this.span.end();
  }
}
