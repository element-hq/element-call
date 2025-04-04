/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Span } from "@opentelemetry/api";
import { type MatrixCall } from "matrix-js-sdk";
import { CallEvent } from "matrix-js-sdk/lib/webrtc/call";
import {
  type TransceiverStats,
  type CallFeedStats,
} from "matrix-js-sdk/lib/webrtc/stats/statsReport";

import { ObjectFlattener } from "./ObjectFlattener";
import { ElementCallOpenTelemetry } from "./otel";
import { type OTelCallAbstractMediaStreamSpan } from "./OTelCallAbstractMediaStreamSpan";
import { OTelCallTransceiverMediaStreamSpan } from "./OTelCallTransceiverMediaStreamSpan";
import { OTelCallFeedMediaStreamSpan } from "./OTelCallFeedMediaStreamSpan";

type StreamId = string;
type MID = string;

/**
 * Tracks an individual call within a group call, either to a full-mesh peer or a focus
 */
export class OTelCall {
  private readonly trackFeedSpan = new Map<
    StreamId,
    OTelCallAbstractMediaStreamSpan
  >();
  private readonly trackTransceiverSpan = new Map<
    MID,
    OTelCallAbstractMediaStreamSpan
  >();

  public constructor(
    public userId: string,
    public deviceId: string,
    public call: MatrixCall,
    public span: Span,
  ) {
    if (call.peerConn) {
      this.addCallPeerConnListeners();
    } else {
      this.call.once(
        CallEvent.PeerConnectionCreated,
        this.addCallPeerConnListeners,
      );
    }
  }

  public dispose(): void {
    this.call.peerConn?.removeEventListener(
      "connectionstatechange",
      this.onCallConnectionStateChanged,
    );
    this.call.peerConn?.removeEventListener(
      "signalingstatechange",
      this.onCallSignalingStateChanged,
    );
    this.call.peerConn?.removeEventListener(
      "iceconnectionstatechange",
      this.onIceConnectionStateChanged,
    );
    this.call.peerConn?.removeEventListener(
      "icegatheringstatechange",
      this.onIceGatheringStateChanged,
    );
    this.call.peerConn?.removeEventListener(
      "icecandidateerror",
      this.onIceCandidateError,
    );
  }

  private addCallPeerConnListeners = (): void => {
    this.call.peerConn?.addEventListener(
      "connectionstatechange",
      this.onCallConnectionStateChanged,
    );
    this.call.peerConn?.addEventListener(
      "signalingstatechange",
      this.onCallSignalingStateChanged,
    );
    this.call.peerConn?.addEventListener(
      "iceconnectionstatechange",
      this.onIceConnectionStateChanged,
    );
    this.call.peerConn?.addEventListener(
      "icegatheringstatechange",
      this.onIceGatheringStateChanged,
    );
    this.call.peerConn?.addEventListener(
      "icecandidateerror",
      this.onIceCandidateError,
    );
  };

  public onCallConnectionStateChanged = (): void => {
    this.span.addEvent("matrix.call.callConnectionStateChange", {
      callConnectionState: this.call.peerConn?.connectionState,
    });
  };

  public onCallSignalingStateChanged = (): void => {
    this.span.addEvent("matrix.call.callSignalingStateChange", {
      callSignalingState: this.call.peerConn?.signalingState,
    });
  };

  public onIceConnectionStateChanged = (): void => {
    this.span.addEvent("matrix.call.iceConnectionStateChange", {
      iceConnectionState: this.call.peerConn?.iceConnectionState,
    });
  };

  public onIceGatheringStateChanged = (): void => {
    this.span.addEvent("matrix.call.iceGatheringStateChange", {
      iceGatheringState: this.call.peerConn?.iceGatheringState,
    });
  };

  public onIceCandidateError = (ev: Event): void => {
    const flatObject = {};
    ObjectFlattener.flattenObjectRecursive(ev, flatObject, "error.", 0);

    this.span.addEvent("matrix.call.iceCandidateError", flatObject);
  };

  public onCallFeedStats(callFeeds: CallFeedStats[]): void {
    let prvFeeds: StreamId[] = [...this.trackFeedSpan.keys()];

    callFeeds.forEach((feed) => {
      if (!this.trackFeedSpan.has(feed.stream)) {
        this.trackFeedSpan.set(
          feed.stream,
          new OTelCallFeedMediaStreamSpan(
            ElementCallOpenTelemetry.instance,
            this.span,
            feed,
          ),
        );
      }
      this.trackFeedSpan.get(feed.stream)?.update(feed);
      prvFeeds = prvFeeds.filter((prvStreamId) => prvStreamId !== feed.stream);
    });

    prvFeeds.forEach((prvStreamId) => {
      this.trackFeedSpan.get(prvStreamId)?.end();
      this.trackFeedSpan.delete(prvStreamId);
    });
  }

  public onTransceiverStats(transceiverStats: TransceiverStats[]): void {
    let prvTransSpan: MID[] = [...this.trackTransceiverSpan.keys()];

    transceiverStats.forEach((transStats) => {
      if (!this.trackTransceiverSpan.has(transStats.mid)) {
        this.trackTransceiverSpan.set(
          transStats.mid,
          new OTelCallTransceiverMediaStreamSpan(
            ElementCallOpenTelemetry.instance,
            this.span,
            transStats,
          ),
        );
      }
      this.trackTransceiverSpan.get(transStats.mid)?.update(transStats);
      prvTransSpan = prvTransSpan.filter(
        (prvStreamId) => prvStreamId !== transStats.mid,
      );
    });

    prvTransSpan.forEach((prvMID) => {
      this.trackTransceiverSpan.get(prvMID)?.end();
      this.trackTransceiverSpan.delete(prvMID);
    });
  }

  public end(): void {
    this.trackFeedSpan.forEach((feedSpan) => feedSpan.end());
    this.trackTransceiverSpan.forEach((transceiverSpan) =>
      transceiverSpan.end(),
    );
    this.span.end();
  }
}
