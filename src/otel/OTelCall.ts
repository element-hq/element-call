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
import { MatrixCall } from "matrix-js-sdk";
import { CallEvent } from "matrix-js-sdk/src/webrtc/call";

import { ObjectFlattener } from "./ObjectFlattener";

/**
 * Tracks an individual call within a group call, either to a full-mesh peer or a focus
 */
export class OTelCall {
  constructor(
    public userId: string,
    public deviceId: string,
    public call: MatrixCall,
    public span: Span
  ) {
    if (call.peerConn) {
      this.addCallPeerConnListeners();
    } else {
      this.call.once(
        CallEvent.PeerConnectionCreated,
        this.addCallPeerConnListeners
      );
    }
  }

  public dispose() {
    this.call.peerConn.removeEventListener(
      "connectionstatechange",
      this.onCallConnectionStateChanged
    );
    this.call.peerConn.removeEventListener(
      "signalingstatechange",
      this.onCallSignalingStateChanged
    );
    this.call.peerConn.removeEventListener(
      "iceconnectionstatechange",
      this.onIceConnectionStateChanged
    );
    this.call.peerConn.removeEventListener(
      "icegatheringstatechange",
      this.onIceGatheringStateChanged
    );
    this.call.peerConn.removeEventListener(
      "icecandidateerror",
      this.onIceCandidateError
    );
  }

  private addCallPeerConnListeners = (): void => {
    this.call.peerConn.addEventListener(
      "connectionstatechange",
      this.onCallConnectionStateChanged
    );
    this.call.peerConn.addEventListener(
      "signalingstatechange",
      this.onCallSignalingStateChanged
    );
    this.call.peerConn.addEventListener(
      "iceconnectionstatechange",
      this.onIceConnectionStateChanged
    );
    this.call.peerConn.addEventListener(
      "icegatheringstatechange",
      this.onIceGatheringStateChanged
    );
    this.call.peerConn.addEventListener(
      "icecandidateerror",
      this.onIceCandidateError
    );
  };

  public onCallConnectionStateChanged = (): void => {
    this.span.addEvent("matrix.call.callConnectionStateChange", {
      callConnectionState: this.call.peerConn.connectionState,
    });
  };

  public onCallSignalingStateChanged = (): void => {
    this.span.addEvent("matrix.call.callSignalingStateChange", {
      callSignalingState: this.call.peerConn.signalingState,
    });
  };

  public onIceConnectionStateChanged = (): void => {
    this.span.addEvent("matrix.call.iceConnectionStateChange", {
      iceConnectionState: this.call.peerConn.iceConnectionState,
    });
  };

  public onIceGatheringStateChanged = (): void => {
    this.span.addEvent("matrix.call.iceGatheringStateChange", {
      iceGatheringState: this.call.peerConn.iceGatheringState,
    });
  };

  public onIceCandidateError = (ev: Event): void => {
    const flatObject = {};
    ObjectFlattener.flattenObjectRecursive(ev, flatObject, "error.", 0);

    this.span.addEvent("matrix.call.iceCandidateError", flatObject);
  };
}
