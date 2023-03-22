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

import opentelemetry, { Span, Attributes, Context } from "@opentelemetry/api";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {
  GroupCall,
  MatrixClient,
  MatrixEvent,
  RoomMember,
} from "matrix-js-sdk";
import { VoipEvent } from "matrix-js-sdk/src/webrtc/call";

import { ElementCallOpenTelemetry } from "./otel";

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
  private callMembershipSpan?: Span;
  private callMembershipContext?: Context;
  private myUserId: string;
  private myMember: RoomMember;
  private readonly speakingSpans = new Map<RoomMember, Map<string, Span>>();

  constructor(private groupCall: GroupCall, client: MatrixClient) {
    this.myUserId = client.getUserId();
    this.myMember = groupCall.room.getMember(client.getUserId());

    ElementCallOpenTelemetry.instance.provider.resource.attributes[
      SemanticResourceAttributes.SERVICE_NAME
    ] = `element-call-${this.myUserId}-${client.getDeviceId()}`;
  }

  public onJoinCall() {
    // Create the main span that tracks the time we intend to be in the call
    this.callMembershipSpan =
      ElementCallOpenTelemetry.instance.tracer.startSpan(
        "matrix.groupCallMembership"
      );
    this.callMembershipSpan.setAttribute(
      "matrix.confId",
      this.groupCall.groupCallId
    );
    this.callMembershipSpan.setAttribute("matrix.userId", this.myUserId);
    this.callMembershipSpan.setAttribute(
      "matrix.displayName",
      this.myMember.name
    );

    this.callMembershipContext = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      this.callMembershipSpan
    );

    this.callMembershipSpan?.addEvent("matrix.joinCall");
  }

  public onLeaveCall() {
    this.callMembershipSpan!.addEvent("matrix.leaveCall");
    // and end the span to indicate we've left
    this.callMembershipSpan!.end();
    this.callMembershipSpan = undefined;
    this.callMembershipContext = undefined;
  }

  public onUpdateRoomState(event: MatrixEvent) {
    if (
      !event ||
      (!event.getType().startsWith("m.call") &&
        !event.getType().startsWith("org.matrix.msc3401.call"))
    ) {
      return;
    }

    this.callMembershipSpan?.addEvent(
      `otel_onRoomStateEvent_${event.getType()}`,
      flattenVoipEvent(event.getContent())
    );
  }

  public onSendEvent(event: VoipEvent) {
    const eventType = event.eventType as string;
    if (!eventType.startsWith("m.call")) return;

    if (event.type === "toDevice") {
      this.callMembershipSpan?.addEvent(
        `matrix.sendToDeviceEvent_${event.eventType}`,
        flattenVoipEvent(event)
      );
    } else if (event.type === "sendEvent") {
      this.callMembershipSpan?.addEvent(
        `matrix.sendToRoomEvent_${event.eventType}`,
        flattenVoipEvent(event)
      );
    }
  }

  public onToggleMicrophoneMuted(newValue: boolean) {
    this.callMembershipSpan?.addEvent("matrix.toggleMicMuted", {
      "matrix.microphone.muted": newValue,
    });
  }

  public onSetMicrophoneMuted(setMuted: boolean) {
    this.callMembershipSpan?.addEvent("matrix.setMicMuted", {
      "matrix.microphone.muted": setMuted,
    });
  }

  public onToggleLocalVideoMuted(newValue: boolean) {
    this.callMembershipSpan?.addEvent("matrix.toggleVidMuted", {
      "matrix.video.muted": newValue,
    });
  }

  public onSetLocalVideoMuted(setMuted: boolean) {
    this.callMembershipSpan?.addEvent("matrix.setVidMuted", {
      "matrix.video.muted": setMuted,
    });
  }

  public onToggleScreensharing(newValue: boolean) {
    this.callMembershipSpan?.addEvent("matrix.setVidMuted", {
      "matrix.screensharing.enabled": newValue,
    });
  }

  public onSpeaking(member: RoomMember, deviceId: string, speaking: boolean) {
    if (speaking) {
      // Ensure that there's an audio activity span for this speaker
      let deviceMap = this.speakingSpans.get(member);
      if (deviceMap === undefined) {
        deviceMap = new Map();
        this.speakingSpans.set(member, deviceMap);
      }

      if (!deviceMap.has(deviceId)) {
        const span = ElementCallOpenTelemetry.instance.tracer.startSpan(
          "matrix.audioActivity",
          undefined,
          this.callMembershipContext
        );
        span.setAttribute("matrix.userId", member.userId);
        span.setAttribute("matrix.displayName", member.rawDisplayName);

        deviceMap.set(deviceId, span);
      }
    } else {
      // End the audio activity span for this speaker, if any
      const deviceMap = this.speakingSpans.get(member);
      deviceMap?.get(deviceId)?.end();
      deviceMap?.delete(deviceId);

      if (deviceMap?.size === 0) this.speakingSpans.delete(member);
    }
  }
}
