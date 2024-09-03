/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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
    protected readonly oTel: ElementCallOpenTelemetry,
    protected readonly callSpan: Span,
    protected readonly type: string,
  ) {
    const ctx = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      callSpan,
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

  protected upsertTrackSpans(tracks: TrackStats[]): void {
    let prvTracks: TrackId[] = [...this.trackSpans.keys()];
    tracks.forEach((t) => {
      if (!this.trackSpans.has(t.id)) {
        this.trackSpans.set(
          t.id,
          new OTelCallMediaStreamTrackSpan(this.oTel, this.span, t),
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

  public abstract update(data: object): void;

  public end(): void {
    this.trackSpans.forEach((tSpan) => {
      tSpan.end();
    });
    this.span.end();
  }
}
