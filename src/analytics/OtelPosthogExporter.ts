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

import { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
  ExportResult,
  ExportResultCode,
  hrTimeToMilliseconds,
} from "@opentelemetry/core";
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
 * This is implementation of {@link SpanExporter} that extracts certain metrics
 * from spans to send to PostHog
 */
export class PosthogSpanExporter implements SpanExporter {
  /**
   * Export spans.
   * @param spans
   * @param resultCallback
   */
  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): Promise<void> {
    await Promise.all(
      spans.map((span) => {
        switch (span.name) {
          case "matrix.groupCallMembership":
            return this.exportGroupCallMembershipSpan(span);
          case "matrix.groupCallMembership.summaryReport":
            return this.exportSummaryReportSpan(span);
          // TBD if there are other spans that we want to process for export to
          // PostHog
        }
      })
    );

    resultCallback({ code: ExportResultCode.SUCCESS });
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

  async exportGroupCallMembershipSpan(span: ReadableSpan): Promise<void> {
    const prevCall = this.prevCall;
    const newPrevCall = (this.prevCall = {
      callId: span.attributes["matrix.confId"] as string,
      hangupTs: hrTimeToMilliseconds(span.endTime),
    });

    // If the user joined the same call within a short time frame, log this as a
    // rejoin. This is interesting as a call quality metric, since rejoins may
    // indicate that users had to intervene to make the product work.
    if (prevCall !== null && newPrevCall.callId === prevCall.callId) {
      const duration = hrTimeToMilliseconds(span.startTime) - prevCall.hangupTs;
      if (duration <= maxRejoinMs) {
        PosthogAnalytics.instance.trackEvent(
          {
            eventName: "Rejoin",
            callId: prevCall.callId,
            rejoinDuration: duration,
          },
          // Send instantly because the window might be closing
          { send_instantly: true }
        );
      }
    }
  }

  async exportSummaryReportSpan(span: ReadableSpan): Promise<void> {
    // Searching for an event like this:
    //    matrix.stats.summary
    //    matrix.stats.summary.percentageReceivedAudioMedia: 0.75
    //    matrix.stats.summary.percentageReceivedMedia: 1
    //    matrix.stats.summary.percentageReceivedVideoMedia; 0.75
    const event = span.events.find((e) => e.name === "matrix.stats.summary");
    if (event !== undefined) {
      const attributes = event.attributes;
      if (attributes) {
        const mediaReceived = `${attributes["matrix.stats.summary.percentageReceivedMedia"]}`;
        const videoReceived = `${attributes["matrix.stats.summary.percentageReceivedVideoMedia"]}`;
        const audioReceived = `${attributes["matrix.stats.summary.percentageReceivedAudioMedia"]}`;
        PosthogAnalytics.instance.trackEvent(
          {
            eventName: "MediaReceived",
            callId: span.attributes["matrix.confId"] as string,
            mediaReceived: mediaReceived,
            audioReceived: audioReceived,
            videoReceived: videoReceived,
          },
          // Send instantly because the window might be closing
          { send_instantly: true }
        );
      }
    }
  }

  /**
   * Shutdown the exporter.
   */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
