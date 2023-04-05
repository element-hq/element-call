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
import {
  GroupCall,
  MatrixClient,
  MatrixEvent,
  RoomMember,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/src/logger";
import {
  CallError,
  CallState,
  MatrixCall,
  VoipEvent,
} from "matrix-js-sdk/src/webrtc/call";
import {
  CallsByUserAndDevice,
  GroupCallError,
  GroupCallEvent,
  GroupCallStatsReport,
} from "matrix-js-sdk/src/webrtc/groupCall";
import {
  ConnectionStatsReport,
  ByteSentStatsReport,
  SummaryStatsReport,
} from "matrix-js-sdk/src/webrtc/stats/statsReport";
import { setSpan } from "@opentelemetry/api/build/esm/trace/context-utils";

import { ElementCallOpenTelemetry } from "./otel";
import { ObjectFlattener } from "./ObjectFlattener";
import { OTelCall } from "./OTelCall";

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
    if (["string", "number", "boolean"].includes(typeof v)) {
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
  private groupCallContext?: Context;
  private myUserId = "unknown";
  private myDeviceId: string;
  private myMember?: RoomMember;
  private callsByCallId = new Map<string, OTelCall>();
  private statsReportSpan: {
    span: Span | undefined;
    stats: OTelStatsReportEvent[];
  };

  constructor(private groupCall: GroupCall, client: MatrixClient) {
    const clientId = client.getUserId();
    if (clientId) {
      this.myUserId = clientId;
      const myMember = groupCall.room.getMember(clientId);
      if (myMember) {
        this.myMember = myMember;
      }
    }
    this.myDeviceId = client.getDeviceId() || "unknown";
    this.statsReportSpan = { span: undefined, stats: [] };
    this.groupCall.on(GroupCallEvent.CallsChanged, this.onCallsChanged);
  }

  dispose() {
    this.groupCall.removeListener(
      GroupCallEvent.CallsChanged,
      this.onCallsChanged
    );
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
    this.callMembershipSpan.setAttribute("matrix.deviceId", this.myDeviceId);
    this.callMembershipSpan.setAttribute(
      "matrix.displayName",
      this.myMember ? this.myMember.name : "unknown-name"
    );

    this.groupCallContext = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      this.callMembershipSpan
    );

    this.callMembershipSpan?.addEvent("matrix.joinCall");
  }

  public onLeaveCall() {
    this.callMembershipSpan?.addEvent("matrix.leaveCall");

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

    this.callMembershipSpan?.addEvent(
      `matrix.roomStateEvent_${event.getType()}`,
      flattenVoipEvent(event.getContent())
    );
  }

  public onCallsChanged = (calls: CallsByUserAndDevice) => {
    for (const [userId, userCalls] of calls.entries()) {
      for (const [deviceId, call] of userCalls.entries()) {
        if (!this.callsByCallId.has(call.callId)) {
          const span = ElementCallOpenTelemetry.instance.tracer.startSpan(
            `matrix.call`,
            undefined,
            this.groupCallContext
          );
          // XXX: anonymity
          span.setAttribute("matrix.call.target.userId", userId);
          span.setAttribute("matrix.call.target.deviceId", deviceId);
          const displayName =
            this.groupCall.room.getMember(userId)?.name ?? "unknown";
          span.setAttribute("matrix.call.target.displayName", displayName);
          this.callsByCallId.set(
            call.callId,
            new OTelCall(userId, deviceId, call, span)
          );
        }
      }
    }

    for (const callTrackingInfo of this.callsByCallId.values()) {
      const userCalls = calls.get(callTrackingInfo.userId);
      if (!userCalls || !userCalls.has(callTrackingInfo.deviceId)) {
        callTrackingInfo.span.end();
        this.callsByCallId.delete(callTrackingInfo.call.callId);
      }
    }
  };

  public onCallStateChange(call: MatrixCall, newState: CallState) {
    const callTrackingInfo = this.callsByCallId.get(call.callId);
    if (!callTrackingInfo) {
      logger.error(`Got call state change for unknown call ID ${call.callId}`);
      return;
    }

    callTrackingInfo.span.addEvent("matrix.call.stateChange", {
      state: newState,
    });
  }

  public onSendEvent(call: MatrixCall, event: VoipEvent) {
    const eventType = event.eventType as string;
    if (!eventType.startsWith("m.call")) return;

    const callTrackingInfo = this.callsByCallId.get(call.callId);
    if (!callTrackingInfo) {
      logger.error(`Got call send event for unknown call ID ${call.callId}`);
      return;
    }

    if (event.type === "toDevice") {
      callTrackingInfo.span.addEvent(
        `matrix.sendToDeviceEvent_${event.eventType}`,
        flattenVoipEvent(event)
      );
    } else if (event.type === "sendEvent") {
      callTrackingInfo.span.addEvent(
        `matrix.sendToRoomEvent_${event.eventType}`,
        flattenVoipEvent(event)
      );
    }
  }

  public onReceivedVoipEvent(event: MatrixEvent) {
    // These come straight from CallEventHandler so don't have
    // a call already associated (in principle we could receive
    // events for calls we don't know about).
    const callId = event.getContent().call_id;
    if (!callId) {
      this.callMembershipSpan?.addEvent("matrix.receive_voip_event_no_callid", {
        "sender.userId": event.getSender(),
      });
      logger.error("Received call event with no call ID!");
      return;
    }

    const call = this.callsByCallId.get(callId);
    if (!call) {
      this.callMembershipSpan?.addEvent(
        "matrix.receive_voip_event_unknown_callid",
        {
          "sender.userId": event.getSender(),
        }
      );
      logger.error("Received call event for unknown call ID " + callId);
      return;
    }

    call.span.addEvent("matrix.receive_voip_event", {
      "sender.userId": event.getSender(),
      ...flattenVoipEvent(event.getContent()),
    });
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

  public onCallError(error: CallError, call: MatrixCall) {
    const callTrackingInfo = this.callsByCallId.get(call.callId);
    if (!callTrackingInfo) {
      logger.error(`Got error for unknown call ID ${call.callId}`);
      return;
    }

    callTrackingInfo.span.recordException(error);
  }

  public onGroupCallError(error: GroupCallError) {
    this.callMembershipSpan?.recordException(error);
  }

  public onUndecryptableToDevice(event: MatrixEvent) {
    this.callMembershipSpan?.addEvent("matrix.toDevice.undecryptable", {
      "sender.userId": event.getSender(),
    });
  }

  public onConnectionStatsReport(
    statsReport: GroupCallStatsReport<ConnectionStatsReport>
  ) {
    const type = OTelStatsReportType.ConnectionReport;
    const data =
      ObjectFlattener.flattenConnectionStatsReportObject(statsReport);
    this.buildStatsEventSpan({ type, data });
  }

  public onByteSentStatsReport(
    statsReport: GroupCallStatsReport<ByteSentStatsReport>
  ) {
    const type = OTelStatsReportType.ByteSentReport;
    const data = ObjectFlattener.flattenByteSentStatsReportObject(statsReport);
    this.buildStatsEventSpan({ type, data });
  }

  public onSummaryStatsReport(
    statsReport: GroupCallStatsReport<SummaryStatsReport>
  ) {
    const type = OTelStatsReportType.SummaryReport;
    const data = ObjectFlattener.flattenSummaryStatsReportObject(statsReport);
    this.buildStatsEventSpan({ type, data });
  }

  private buildStatsEventSpan(event: OTelStatsReportEvent): void {
    // @ TODO: fix this - Because on multiple calls we receive multiple stats report spans.
    // This could be break if stats arrived in same time from different call objects.
    if (this.statsReportSpan.span === undefined && this.callMembershipSpan) {
      const ctx = setSpan(
        opentelemetry.context.active(),
        this.callMembershipSpan
      );
      this.statsReportSpan.span =
        ElementCallOpenTelemetry.instance.tracer.startSpan(
          "matrix.groupCallMembership.statsReport",
          undefined,
          ctx
        );
      this.statsReportSpan.span.setAttribute(
        "matrix.confId",
        this.groupCall.groupCallId
      );
      this.statsReportSpan.span.setAttribute("matrix.userId", this.myUserId);
      this.statsReportSpan.span.setAttribute(
        "matrix.displayName",
        this.myMember ? this.myMember.name : "unknown-name"
      );

      this.statsReportSpan.span.addEvent(event.type, event.data);
      this.statsReportSpan.stats.push(event);
    } else if (
      this.statsReportSpan.span !== undefined &&
      this.callMembershipSpan
    ) {
      this.statsReportSpan.span.addEvent(event.type, event.data);
      this.statsReportSpan.stats.push(event);
      // if received all three types of stats close this
      if (this.statsReportSpan.stats.length === 3) {
        this.statsReportSpan.span.end();
        this.statsReportSpan = { span: undefined, stats: [] };
      }
    }
  }
}

interface OTelStatsReportEvent {
  type: OTelStatsReportType;
  data: Attributes;
}

enum OTelStatsReportType {
  ConnectionReport = "matrix.stats.connection",
  ByteSentReport = "matrix.stats.byteSent",
  SummaryReport = "matrix.stats.summary",
}
