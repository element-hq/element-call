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

import { Span } from "@opentelemetry/api";
import {
  TrackStats,
  TransceiverStats,
} from "matrix-js-sdk/src/webrtc/stats/statsReport";

import { ElementCallOpenTelemetry } from "./otel";
import { OTelCallAbstractMediaStreamSpan } from "./OTelCallAbstractMediaStreamSpan";

export class OTelCallTransceiverMediaStreamSpan extends OTelCallAbstractMediaStreamSpan {
  private readonly prev: {
    direction: string;
    currentDirection: string;
  };

  public constructor(
    protected readonly oTel: ElementCallOpenTelemetry,
    protected readonly callSpan: Span,
    stats: TransceiverStats
  ) {
    super(oTel, callSpan, `matrix.call.transceiver.${stats.mid}`);
    this.span.setAttribute("transceiver.mid", stats.mid);

    this.prev = {
      direction: stats.direction,
      currentDirection: stats.currentDirection,
    };
    this.span.addEvent("matrix.call.transceiver.initState", this.prev);
  }

  public update(stats: TransceiverStats): void {
    if (this.prev.currentDirection !== stats.currentDirection) {
      this.span.addEvent("matrix.call.transceiver.currentDirection", {
        currentDirection: stats.currentDirection,
      });
      this.prev.currentDirection = stats.currentDirection;
    }
    if (this.prev.direction !== stats.direction) {
      this.span.addEvent("matrix.call.transceiver.direction", {
        direction: stats.direction,
      });
      this.prev.direction = stats.direction;
    }

    const trackStats: TrackStats[] = [];
    if (stats.sender) {
      trackStats.push(stats.sender);
    }
    if (stats.receiver) {
      trackStats.push(stats.receiver);
    }
    this.upsertTrackSpans(trackStats);
  }
}
