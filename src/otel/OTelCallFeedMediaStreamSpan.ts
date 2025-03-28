/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Span } from "@opentelemetry/api";
import {
  type CallFeedStats,
  type TrackStats,
} from "matrix-js-sdk/lib/webrtc/stats/statsReport";

import { type ElementCallOpenTelemetry } from "./otel";
import { OTelCallAbstractMediaStreamSpan } from "./OTelCallAbstractMediaStreamSpan";

export class OTelCallFeedMediaStreamSpan extends OTelCallAbstractMediaStreamSpan {
  private readonly prev: { isAudioMuted: boolean; isVideoMuted: boolean };

  public constructor(
    protected readonly oTel: ElementCallOpenTelemetry,
    protected readonly callSpan: Span,
    callFeed: CallFeedStats,
  ) {
    const postFix =
      callFeed.type === "local" && callFeed.prefix === "from-call-feed"
        ? "(clone)"
        : "";
    super(oTel, callSpan, `matrix.call.feed.${callFeed.type}${postFix}`);
    this.span.setAttribute("feed.streamId", callFeed.stream);
    this.span.setAttribute("feed.type", callFeed.type);
    this.span.setAttribute("feed.readFrom", callFeed.prefix);
    this.span.setAttribute("feed.purpose", callFeed.purpose);
    this.prev = {
      isAudioMuted: callFeed.isAudioMuted,
      isVideoMuted: callFeed.isVideoMuted,
    };
    this.span.addEvent("matrix.call.feed.initState", this.prev);
  }

  public update(callFeed: CallFeedStats): void {
    if (this.prev.isAudioMuted !== callFeed.isAudioMuted) {
      this.span.addEvent("matrix.call.feed.audioMuted", {
        isAudioMuted: callFeed.isAudioMuted,
      });
      this.prev.isAudioMuted = callFeed.isAudioMuted;
    }
    if (this.prev.isVideoMuted !== callFeed.isVideoMuted) {
      this.span.addEvent("matrix.call.feed.isVideoMuted", {
        isVideoMuted: callFeed.isVideoMuted,
      });
      this.prev.isVideoMuted = callFeed.isVideoMuted;
    }

    const trackStats: TrackStats[] = [];
    if (callFeed.video) {
      trackStats.push(callFeed.video);
    }
    if (callFeed.audio) {
      trackStats.push(callFeed.audio);
    }
    this.upsertTrackSpans(trackStats);
  }
}
