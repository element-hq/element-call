/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import opentelemetry, {
  type Span,
  type Attributes,
  type Context,
} from "@opentelemetry/api";
import {
  type GroupCall,
  type MatrixClient,
  type MatrixEvent,
  type RoomMember,
} from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  type CallError,
  type CallState,
  type MatrixCall,
  type VoipEvent,
} from "matrix-js-sdk/lib/webrtc/call";
import {
  type CallsByUserAndDevice,
  type GroupCallError,
  GroupCallEvent,
  type GroupCallStatsReport,
} from "matrix-js-sdk/lib/webrtc/groupCall";
import {
  type ConnectionStatsReport,
  type ByteSentStatsReport,
  type SummaryStatsReport,
  type CallFeedReport,
} from "matrix-js-sdk/lib/webrtc/stats/statsReport";

import { ElementCallOpenTelemetry } from "./otel";
import { ObjectFlattener } from "./ObjectFlattener";
import { OTelCall } from "./OTelCall";

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
  private readonly speakingSpans = new Map<RoomMember, Map<string, Span>>();

  public constructor(
    private groupCall: GroupCall,
    client: MatrixClient,
  ) {
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

  public dispose(): void {
    this.groupCall.removeListener(
      GroupCallEvent.CallsChanged,
      this.onCallsChanged,
    );
  }

  public onJoinCall(): void {
    if (!ElementCallOpenTelemetry.instance) return;
    if (this.callMembershipSpan !== undefined) {
      logger.warn("Call membership span is already started");
      return;
    }

    // Create the main span that tracks the time we intend to be in the call
    this.callMembershipSpan =
      ElementCallOpenTelemetry.instance.tracer.startSpan(
        "matrix.groupCallMembership",
      );
    this.callMembershipSpan.setAttribute(
      "matrix.confId",
      this.groupCall.groupCallId,
    );
    this.callMembershipSpan.setAttribute("matrix.userId", this.myUserId);
    this.callMembershipSpan.setAttribute("matrix.deviceId", this.myDeviceId);
    this.callMembershipSpan.setAttribute(
      "matrix.displayName",
      this.myMember ? this.myMember.name : "unknown-name",
    );

    this.groupCallContext = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      this.callMembershipSpan,
    );

    this.callMembershipSpan?.addEvent("matrix.joinCall");
  }

  public onLeaveCall(): void {
    if (this.callMembershipSpan === undefined) {
      logger.warn("Call membership span is already ended");
      return;
    }

    this.callMembershipSpan.addEvent("matrix.leaveCall");
    // and end the span to indicate we've left
    this.callMembershipSpan.end();
    this.callMembershipSpan = undefined;
    this.groupCallContext = undefined;
  }

  public onUpdateRoomState(event: MatrixEvent): void {
    if (
      !event ||
      (!event.getType().startsWith("m.call") &&
        !event.getType().startsWith("org.matrix.msc3401.call"))
    ) {
      return;
    }

    this.callMembershipSpan?.addEvent(
      `matrix.roomStateEvent_${event.getType()}`,
      ObjectFlattener.flattenVoipEvent(event.getContent()),
    );
  }

  public onCallsChanged(calls: CallsByUserAndDevice): void {
    for (const [userId, userCalls] of calls.entries()) {
      for (const [deviceId, call] of userCalls.entries()) {
        if (!this.callsByCallId.has(call.callId)) {
          if (ElementCallOpenTelemetry.instance) {
            const span = ElementCallOpenTelemetry.instance.tracer.startSpan(
              `matrix.call`,
              undefined,
              this.groupCallContext,
            );
            // XXX: anonymity
            span.setAttribute("matrix.call.target.userId", userId);
            span.setAttribute("matrix.call.target.deviceId", deviceId);
            const displayName =
              this.groupCall.room.getMember(userId)?.name ?? "unknown";
            span.setAttribute("matrix.call.target.displayName", displayName);
            this.callsByCallId.set(
              call.callId,
              new OTelCall(userId, deviceId, call, span),
            );
          }
        }
      }
    }

    for (const callTrackingInfo of this.callsByCallId.values()) {
      const userCalls = calls.get(callTrackingInfo.userId);
      if (
        !userCalls ||
        !userCalls.has(callTrackingInfo.deviceId) ||
        userCalls.get(callTrackingInfo.deviceId)?.callId !==
          callTrackingInfo.call.callId
      ) {
        callTrackingInfo.end();
        this.callsByCallId.delete(callTrackingInfo.call.callId);
      }
    }
  }

  public onCallStateChange(call: MatrixCall, newState: CallState): void {
    const callTrackingInfo = this.callsByCallId.get(call.callId);
    if (!callTrackingInfo) {
      logger.error(`Got call state change for unknown call ID ${call.callId}`);
      return;
    }

    callTrackingInfo.span.addEvent("matrix.call.stateChange", {
      state: newState,
    });
  }

  public onSendEvent(call: MatrixCall, event: VoipEvent): void {
    const eventType = event.eventType as string;
    if (
      !eventType.startsWith("m.call") &&
      !eventType.startsWith("org.matrix.call")
    )
      return;

    const callTrackingInfo = this.callsByCallId.get(call.callId);
    if (!callTrackingInfo) {
      logger.error(`Got call send event for unknown call ID ${call.callId}`);
      return;
    }

    if (event.type === "toDevice") {
      callTrackingInfo.span.addEvent(
        `matrix.sendToDeviceEvent_${event.eventType}`,
        ObjectFlattener.flattenVoipEvent(event),
      );
    } else if (event.type === "sendEvent") {
      callTrackingInfo.span.addEvent(
        `matrix.sendToRoomEvent_${event.eventType}`,
        ObjectFlattener.flattenVoipEvent(event),
      );
    }
  }

  public onReceivedVoipEvent(event: MatrixEvent): void {
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
        },
      );
      logger.error("Received call event for unknown call ID " + callId);
      return;
    }

    call.span.addEvent("matrix.receive_voip_event", {
      "sender.userId": event.getSender(),
      ...ObjectFlattener.flattenVoipEvent(event.getContent()),
    });
  }

  public onToggleMicrophoneMuted(newValue: boolean): void {
    this.callMembershipSpan?.addEvent("matrix.toggleMicMuted", {
      "matrix.microphone.muted": newValue,
    });
  }

  public onSetMicrophoneMuted(setMuted: boolean): void {
    this.callMembershipSpan?.addEvent("matrix.setMicMuted", {
      "matrix.microphone.muted": setMuted,
    });
  }

  public onToggleLocalVideoMuted(newValue: boolean): void {
    this.callMembershipSpan?.addEvent("matrix.toggleVidMuted", {
      "matrix.video.muted": newValue,
    });
  }

  public onSetLocalVideoMuted(setMuted: boolean): void {
    this.callMembershipSpan?.addEvent("matrix.setVidMuted", {
      "matrix.video.muted": setMuted,
    });
  }

  public onToggleScreensharing(newValue: boolean): void {
    this.callMembershipSpan?.addEvent("matrix.setVidMuted", {
      "matrix.screensharing.enabled": newValue,
    });
  }

  public onSpeaking(
    member: RoomMember,
    deviceId: string,
    speaking: boolean,
  ): void {
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
          this.groupCallContext,
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

  public onCallError(error: CallError, call: MatrixCall): void {
    const callTrackingInfo = this.callsByCallId.get(call.callId);
    if (!callTrackingInfo) {
      logger.error(`Got error for unknown call ID ${call.callId}`);
      return;
    }

    callTrackingInfo.span.recordException(error);
  }

  public onGroupCallError(error: GroupCallError): void {
    this.callMembershipSpan?.recordException(error);
  }

  public onUndecryptableToDevice(event: MatrixEvent): void {
    this.callMembershipSpan?.addEvent("matrix.toDevice.undecryptable", {
      "sender.userId": event.getSender(),
    });
  }

  public onCallFeedStatsReport(
    report: GroupCallStatsReport<CallFeedReport>,
  ): void {
    if (!ElementCallOpenTelemetry.instance) return;
    let call: OTelCall | undefined;
    const callId = report.report?.callId;

    if (callId) {
      call = this.callsByCallId.get(callId);
    }

    if (!call) {
      this.callMembershipSpan?.addEvent(
        OTelStatsReportType.CallFeedReport + "_unknown_callId",
        {
          "call.callId": callId,
          "call.opponentMemberId": report.report?.opponentMemberId
            ? report.report?.opponentMemberId
            : "unknown",
        },
      );
      logger.error(
        `Received ${OTelStatsReportType.CallFeedReport} with unknown call ID: ${callId}`,
      );
      return;
    } else {
      call.onCallFeedStats(report.report.callFeeds);
      call.onTransceiverStats(report.report.transceiver);
    }
  }

  public onConnectionStatsReport(
    statsReport: GroupCallStatsReport<ConnectionStatsReport>,
  ): void {
    this.buildCallStatsSpan(
      OTelStatsReportType.ConnectionReport,
      statsReport.report,
    );
  }

  public onByteSentStatsReport(
    statsReport: GroupCallStatsReport<ByteSentStatsReport>,
  ): void {
    this.buildCallStatsSpan(
      OTelStatsReportType.ByteSentReport,
      statsReport.report,
    );
  }

  public buildCallStatsSpan(
    type: OTelStatsReportType,
    report: ByteSentStatsReport | ConnectionStatsReport,
  ): void {
    if (!ElementCallOpenTelemetry.instance) return;
    let call: OTelCall | undefined;
    const callId = report?.callId;

    if (callId) {
      call = this.callsByCallId.get(callId);
    }

    if (!call) {
      this.callMembershipSpan?.addEvent(type + "_unknown_callid", {
        "call.callId": callId,
        "call.opponentMemberId": report.opponentMemberId
          ? report.opponentMemberId
          : "unknown",
      });
      logger.error(`Received ${type} with unknown call ID: ${callId}`);
      return;
    }
    const data = ObjectFlattener.flattenReportObject(type, report);
    const ctx = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      call.span,
    );

    const options = {
      links: [
        {
          context: call.span.spanContext(),
        },
      ],
    };

    const span = ElementCallOpenTelemetry.instance.tracer.startSpan(
      type,
      options,
      ctx,
    );

    span.setAttribute("matrix.callId", callId ?? "unknown");
    span.setAttribute(
      "matrix.opponentMemberId",
      report.opponentMemberId ? report.opponentMemberId : "unknown",
    );
    span.addEvent("matrix.call.connection_stats_event", data);
    span.end();
  }

  public onSummaryStatsReport(
    statsReport: GroupCallStatsReport<SummaryStatsReport>,
  ): void {
    if (!ElementCallOpenTelemetry.instance) return;

    const type = OTelStatsReportType.SummaryReport;
    const data = ObjectFlattener.flattenSummaryStatsReportObject(statsReport);
    if (this.statsReportSpan.span === undefined && this.callMembershipSpan) {
      const ctx = opentelemetry.trace.setSpan(
        opentelemetry.context.active(),
        this.callMembershipSpan,
      );
      const span = ElementCallOpenTelemetry.instance?.tracer.startSpan(
        "matrix.groupCallMembership.summaryReport",
        undefined,
        ctx,
      );
      if (span === undefined) {
        return;
      }
      span.setAttribute("matrix.confId", this.groupCall.groupCallId);
      span.setAttribute("matrix.userId", this.myUserId);
      span.setAttribute(
        "matrix.displayName",
        this.myMember ? this.myMember.name : "unknown-name",
      );
      span.addEvent(type, data);
      span.end();
    }
  }
}

interface OTelStatsReportEvent {
  type: OTelStatsReportType;
  data: Attributes;
}

enum OTelStatsReportType {
  ConnectionReport = "matrix.call.stats.connection",
  ByteSentReport = "matrix.call.stats.byteSent",
  SummaryReport = "matrix.stats.summary",
  CallFeedReport = "matrix.stats.call_feed",
}
