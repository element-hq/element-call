/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type SpanProcessor,
  type ReadableSpan,
  type Span,
} from "@opentelemetry/sdk-trace-base";
import { hrTimeToMilliseconds } from "@opentelemetry/core";
import { logger } from "matrix-js-sdk/lib/logger";

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
  public async forceFlush(): Promise<void> {}

  public onStart(span: Span): void {
    // Hack: Yield to allow attributes to be set before processing
    try {
      switch (span.name) {
        case "matrix.groupCallMembership":
          this.onGroupCallMembershipStart(span);
          return;
        case "matrix.groupCallMembership.summaryReport":
          this.onSummaryReportStart(span);
          return;
      }
    } catch (e) {
      // log to avoid tripping @typescript-eslint/no-unused-vars
      logger.debug(e);
    }
  }

  public onEnd(span: ReadableSpan): void {
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
      logger.warn("Invalid prev call data", data, "error:", e);
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
        const peerConnections = `${attributes["matrix.stats.summary.peerConnections"]}`;
        const percentageConcealedAudio = `${attributes["matrix.stats.summary.percentageConcealedAudio"]}`;
        const opponentUsersInCall = `${attributes["matrix.stats.summary.opponentUsersInCall"]}`;
        const opponentDevicesInCall = `${attributes["matrix.stats.summary.opponentDevicesInCall"]}`;
        const diffDevicesToPeerConnections = `${attributes["matrix.stats.summary.diffDevicesToPeerConnections"]}`;
        const ratioPeerConnectionToDevices = `${attributes["matrix.stats.summary.ratioPeerConnectionToDevices"]}`;

        PosthogAnalytics.instance.trackEvent(
          {
            eventName: "MediaReceived",
            callId: span.attributes["matrix.confId"] as string,
            mediaReceived: mediaReceived,
            audioReceived: audioReceived,
            videoReceived: videoReceived,
            maxJitter: maxJitter,
            maxPacketLoss: maxPacketLoss,
            peerConnections: peerConnections,
            percentageConcealedAudio: percentageConcealedAudio,
            opponentUsersInCall: opponentUsersInCall,
            opponentDevicesInCall: opponentDevicesInCall,
            diffDevicesToPeerConnections: diffDevicesToPeerConnections,
            ratioPeerConnectionToDevices: ratioPeerConnectionToDevices,
          },
          // Send instantly because the window might be closing
          { send_instantly: true },
        );
      }
    }
  }

  /**
   * Shutdown the processor.
   */
  public async shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
