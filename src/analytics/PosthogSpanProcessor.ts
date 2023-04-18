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

import {
  SpanProcessor,
  ReadableSpan,
  Span,
} from "@opentelemetry/sdk-trace-base";
import { hrTimeToMilliseconds } from "@opentelemetry/core";
import { logger } from "matrix-js-sdk/src/logger";

import { PosthogAnalytics } from "./PosthogAnalytics";

interface PrevCall {
  callId: string;
  hangupTs: number;
}

/**
 * The maximum time between hanging up and joining the same call that we would
 * consider a 'rejoin' on the user's part.
 */
const maxRejoinMs = 2 * 60 * 1000; // 2 minutes

/**
 * Span processor that extracts certain metrics from spans to send to PostHog
 */
export class PosthogSpanProcessor implements SpanProcessor {
  async forceFlush(): Promise<void> {}

  onStart(span: Span): void {
    // Hack: Yield to allow attributes to be set before processing
    Promise.resolve().then(() => {
      switch (span.name) {
        case "matrix.groupCallMembership":
          this.onGroupCallMembershipStart(span);
          return;
        case "matrix.groupCallMembership.summaryReport":
          this.onSummaryReportStart(span);
          return;
      }
    });
  }

  onEnd(span: ReadableSpan): void {
    switch (span.name) {
      case "matrix.groupCallMembership":
        this.onGroupCallMembershipEnd(span);
        return;
    }
  }

  private get prevCall(): PrevCall | null {
    // This is stored in localStorage so we can remember the previous call
    // across app restarts
    const data = localStorage.getItem("matrix-prev-call");
    if (data === null) return null;

    try {
      return JSON.parse(data);
    } catch (e) {
      logger.warn("Invalid prev call data", data);
      return null;
    }
  }

  private set prevCall(data: PrevCall | null) {
    localStorage.setItem("matrix-prev-call", JSON.stringify(data));
  }

  private onGroupCallMembershipStart(span: ReadableSpan): void {
    const prevCall = this.prevCall;
    const newCallId = span.attributes["matrix.confId"] as string;

    // If the user joined the same call within a short time frame, log this as a
    // rejoin. This is interesting as a call quality metric, since rejoins may
    // indicate that users had to intervene to make the product work.
    if (prevCall !== null && newCallId === prevCall.callId) {
      const duration = hrTimeToMilliseconds(span.startTime) - prevCall.hangupTs;
      if (duration <= maxRejoinMs) {
        PosthogAnalytics.instance.trackEvent({
          eventName: "Rejoin",
          callId: prevCall.callId,
          rejoinDuration: duration,
        });
      }
    }
  }

  private onGroupCallMembershipEnd(span: ReadableSpan): void {
    this.prevCall = {
      callId: span.attributes["matrix.confId"] as string,
      hangupTs: hrTimeToMilliseconds(span.endTime),
    };
  }

  private onSummaryReportStart(span: ReadableSpan): void {
    // Searching for an event like this:
    //    matrix.stats.summary
    //    matrix.stats.summary.percentageReceivedAudioMedia: 0.75
    //    matrix.stats.summary.percentageReceivedMedia: 1
    //    matrix.stats.summary.percentageReceivedVideoMedia: 0.75
    //    matrix.stats.summary.maxJitter: 100
    //    matrix.stats.summary.maxPacketLoss: 20
    const event = span.events.find((e) => e.name === "matrix.stats.summary");
    if (event !== undefined) {
      const attributes = event.attributes;
      if (attributes) {
        const mediaReceived = `${attributes["matrix.stats.summary.percentageReceivedMedia"]}`;
        const videoReceived = `${attributes["matrix.stats.summary.percentageReceivedVideoMedia"]}`;
        const audioReceived = `${attributes["matrix.stats.summary.percentageReceivedAudioMedia"]}`;
        const maxJitter = `${attributes["matrix.stats.summary.maxJitter"]}`;
        const maxPacketLoss = `${attributes["matrix.stats.summary.maxPacketLoss"]}`;
        PosthogAnalytics.instance.trackEvent(
          {
            eventName: "MediaReceived",
            callId: span.attributes["matrix.confId"] as string,
            mediaReceived: mediaReceived,
            audioReceived: audioReceived,
            videoReceived: videoReceived,
            maxJitter: maxJitter,
            maxPacketLoss: maxPacketLoss,
          },
          // Send instantly because the window might be closing
          { send_instantly: true }
        );
        window.console.log("#### p ", {
          eventName: "MediaReceived",
          callId: span.attributes["matrix.confId"] as string,
          mediaReceived: mediaReceived,
          audioReceived: audioReceived,
          videoReceived: videoReceived,
          maxJitter: maxJitter,
          maxPacketLoss: maxPacketLoss,
        });
      }
    }
  }

  /**
   * Shutdown the processor.
   */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
