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
    currenDirection: string;
  };

  constructor(
    readonly oTel: ElementCallOpenTelemetry,
    readonly callSpan: Span,
    stats: TransceiverStats
  ) {
    super(oTel, callSpan, `matrix.call.transceiver.${stats.mid}`);
    this.span.setAttribute("transceiver.mid", stats.mid);

    this.prev = {
      direction: stats.direction,
      currenDirection: stats.currenDirection,
    };
    this.span.addEvent("matrix.call.transceiver.initState", this.prev);
  }

  public update(stats: TransceiverStats): void {
    if (this.prev.currenDirection !== stats.currenDirection) {
      this.span.addEvent("matrix.call.transceiver.currenDirection", {
        currenDirection: stats.currenDirection,
      });
      this.prev.currenDirection = stats.currenDirection;
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
