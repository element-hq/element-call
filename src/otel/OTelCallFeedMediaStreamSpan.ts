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
  CallFeedStats,
  TrackStats,
} from "matrix-js-sdk/src/webrtc/stats/statsReport";

import { ElementCallOpenTelemetry } from "./otel";
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
