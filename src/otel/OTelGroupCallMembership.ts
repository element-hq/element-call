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

import opentelemetry, { Span, Attributes } from "@opentelemetry/api";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {
  GroupCall,
  MatrixClient,
  MatrixEvent,
  RoomMember,
} from "matrix-js-sdk";
import { VoipEvent } from "matrix-js-sdk/src/webrtc/call";
import { GroupCallStatsReport } from "matrix-js-sdk/src/webrtc/groupCall";
import { ConnectionStatsReport, ByteSendStatsReport } from "matrix-js-sdk/src/webrtc/stats/statsReport";

import { provider, tracer } from "./otel";
import { ObjectFlattener } from "./ObjectFlattener";

/**
 * Flattens out an object into a single layer with components
 * of the key separated by dots
 */
function flattenVoipEvent(event: VoipEvent): Attributes {
  const flatObject = {};

  flattenVoipEventRecursive(
    event as unknown as Record<string, unknown>, // XXX Types
    flatObject,
    "matrix.event.",
    0
  );

  return flatObject;
}

function flattenVoipEventRecursive(
  obj: Record<string, unknown>,
  flatObject: Record<string, unknown>,
  prefix: string,
  depth: number
) {
  if (depth > 10)
    throw new Error(
      "Depth limit exceeded: aborting VoipEvent recursion. Prefix is " + prefix
    );

  for (const [k, v] of Object.entries(obj)) {
    if (["string", "number"].includes(typeof v)) {
      flatObject[prefix + k] = v;
    } else if (typeof v === "object") {
      flattenVoipEventRecursive(
        v as Record<string, unknown>,
        flatObject,
        prefix + k + ".",
        depth + 1
      );
    }
  }
}

/**
 * Represent the span of time which we intend to be joined to a group call
 */
export class OTelGroupCallMembership {
  private callMembershipSpan: Span;
  private myUserId: string;
  private myMember: RoomMember;

  constructor(private groupCall: GroupCall, client: MatrixClient) {
    this.myUserId = client.getUserId();
    this.myMember = groupCall.room.getMember(client.getUserId());

    provider.resource.attributes[
      SemanticResourceAttributes.SERVICE_NAME
    ] = `element-call-${this.myUserId}-${client.getDeviceId()}`;
  }

  public onJoinCall() {
    // Create the main span that tracks the time we intend to be in the call
    this.callMembershipSpan = tracer.startSpan("matrix.groupCallMembership");
    this.callMembershipSpan.setAttribute(
      "matrix.confId",
      this.groupCall.groupCallId
    );
    this.callMembershipSpan.setAttribute("matrix.userId", this.myUserId);
    this.callMembershipSpan.setAttribute(
      "matrix.displayName",
      this.myMember.name
    );

    opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      this.callMembershipSpan
    );

    this.callMembershipSpan.addEvent("matrix.joinCall");
  }

  public onLeaveCall() {
    this.callMembershipSpan.addEvent("matrix.leaveCall");

    // and end the main span to indicate we've left
    if (this.callMembershipSpan) this.callMembershipSpan.end();
  }

  public onUpdateRoomState(event: MatrixEvent) {
    if (
      !event ||
      (!event.getType().startsWith("m.call") &&
        !event.getType().startsWith("org.matrix.msc3401.call"))
    ) {
      return;
    }

    this.callMembershipSpan.addEvent(
      `otel_onRoomStateEvent_${event.getType()}`,
      flattenVoipEvent(event.getContent())
    );
  }

  public onSendEvent(event: VoipEvent) {
    const eventType = event.eventType as string;
    if (!eventType.startsWith("m.call")) return;

    if (event.type === "toDevice") {
      this.callMembershipSpan.addEvent(
        `matrix.sendToDeviceEvent_${event.eventType}`,
        flattenVoipEvent(event)
      );
    } else if (event.type === "sendEvent") {
      this.callMembershipSpan.addEvent(
        `matrix.sendToRoomEvent_${event.eventType}`,
        flattenVoipEvent(event)
      );
    }
  }

  public onToggleMicrophoneMuted(newValue: boolean) {
    this.callMembershipSpan.addEvent("matrix.toggleMicMuted", {
      "matrix.microphone.muted": newValue,
    });
  }

  public onSetMicrophoneMuted(setMuted: boolean) {
    this.callMembershipSpan.addEvent("matrix.setMicMuted", {
      "matrix.microphone.muted": setMuted,
    });
  }

  public onToggleLocalVideoMuted(newValue: boolean) {
    this.callMembershipSpan.addEvent("matrix.toggleVidMuted", {
      "matrix.video.muted": newValue,
    });
  }

  public onSetLocalVideoMuted(setMuted: boolean) {
    this.callMembershipSpan.addEvent("matrix.setVidMuted", {
      "matrix.video.muted": setMuted,
    });
  }

  public onToggleScreensharing(newValue: boolean) {
    this.callMembershipSpan.addEvent("matrix.setVidMuted", {
      "matrix.screensharing.enabled": newValue,
    });
  }

  public onConnectionStatsReport(statsReport: GroupCallStatsReport<ConnectionStatsReport>) {
    this.callMembershipSpan.addEvent("matrix.stats.connection", ObjectFlattener.flattenConnectionStatsReportObject(statsReport));
  }

  public onByteSendStatsReport(statsReport: GroupCallStatsReport<ByteSendStatsReport>) {
    this.callMembershipSpan.addEvent("matrix.stats.byteSend", ObjectFlattener.flattenByteSendStatsReportObject(statsReport));
  }
}
