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

import opentelemetry, { Context, Span } from "@opentelemetry/api";
import {
  ClientEvent,
  GroupCall,
  MatrixClient,
  MatrixEvent,
  RoomStateEvent,
} from "matrix-js-sdk";
import { CallEvent } from "matrix-js-sdk/src/webrtc/call";
import { useCallback, useEffect, useState } from "react";

import { tracer } from "./otel";

/**
 * Represent the span of time which we intend to be joined to a group call
 */
export class OTelGroupCallMembership {
  private context: Context;
  private callMembershipSpan: Span;

  constructor(private groupCall: GroupCall) {
    const callIdContext = opentelemetry.context
      .active()
      .setValue(Symbol("confId"), groupCall.groupCallId);

    // Create the main span that tracks the time we intend to be in the call
    this.callMembershipSpan = tracer.startSpan(
      "otel_groupCallMembershipSpan",
      undefined,
      callIdContext
    );

    // Create a new call based on the callIdContext. This context also has a span assigned to it.
    // Other spans can use this context to extract the parent span.
    // (When passing this context to startSpan the started span will use the span set in the context (in this case the callSpan) as the parent)
    this.context = opentelemetry.trace.setSpan(
      opentelemetry.context.active(),
      this.callMembershipSpan
    );
  }

  public onJoinCall() {
    // Here we start a very short span. This is a hack to trigger the posthog exporter.
    // Only ended spans are processed by the exporter.
    // We want the exporter to know that a call has started
    const joinCallSpan = tracer.startSpan(
      "otel_joinCallSpan",
      undefined,
      this.context
    );
    joinCallSpan.end();
  }

  public onLeaveCall() {
    // A very short span to represent us leaving the call
    const startCallSpan = tracer.startSpan(
      "otel_leaveCallSpan",
      undefined,
      this.context
    );
    startCallSpan.end();

    // and end the main span to indicate we've left
    this.callMembershipSpan.end();
  }

  public onSendStateEvent(stateEvent: MatrixEvent) {}

  public onSendToDeviceEvent(toDeviceEvent: Record<string, unknown>) {
    const eventType = toDeviceEvent.eventType as string;
    if (!eventType.startsWith("m.call")) return;

    const span = tracer.startSpan(
      `otel_sendToDeviceEvent_${toDeviceEvent.eventType}`,
      undefined,
      this.context
    );

    for (const [k, v] of Object.entries(toDeviceEvent)) {
      if (["string", "number"].includes(typeof v))
        span.setAttribute(k, v as string | number);
    }
  }
}

export const useCallEventInstrumentation = (
  client: MatrixClient,
  groupCall: GroupCall
): void => {
  const [groupCallSpan, setGroupCallSpan] = useState<Span | undefined>();
  const [groupCallId, setGroupCallId] = useState<string | undefined>();

  const startChildSpan = useCallback(
    (name: string, groupCallId: string): Span => {
      const traceId = "7b78c1f568312cb288e55a9bc3c28cc5";
      const spanId = "7d31f3e430d90882";

      const ctx = opentelemetry.trace.setSpanContext(context.active(), {
        traceId,
        spanId,
        traceFlags: 1,
        isRemote: true,
      });

      console.log("LOG context", ctx);
      console.log(
        "LOG context valid",
        trace.isSpanContextValid(trace.getSpan(ctx).spanContext())
      );
      console.log("LOG parent span", trace.getSpan(ctx));

      return tracer.startSpan(name, undefined, ctx);
    },
    []
  );

  const onUpdateRoomState = useCallback((event?: MatrixEvent) => {
    /*const callStateEvent = groupCall.room.currentState.getStateEvents(
        "org.matrix.msc3401.call",
        groupCall.groupCallId
      );*/
    /*const memberStateEvents = groupCall.room.currentState.getStateEvents(
        "org.matrix.msc3401.call.member"
      );*/
  }, []);

  const onReceivedVoipEvent = (event: MatrixEvent) => {};

  const onUndecryptableToDevice = (event: MatrixEvent) => {};

  const onSendVoipEvent = useCallback(
    (event: Record<string, unknown>) => {
      const span = startChildSpan(
        `element-call:send-voip-event:${event.eventType}`,
        groupCall.groupCallId
      );
      span.setAttribute("groupCallId", groupCall.groupCallId);

      console.log("LOG span", span);

      span.end();
    },
    [groupCall.groupCallId, startChildSpan]
  );

  useEffect(() => {
    return;
    if (groupCallId === groupCall.groupCallId) return;

    console.log("LOG starting span", groupCall.groupCallId, groupCallId);

    groupCallSpan?.end();

    const newSpan = tracer.startSpan("element-call:group-call");
    newSpan.setAttribute("groupCallId", groupCall.groupCallId);
    setGroupCallSpan(newSpan);
    setGroupCallId(groupCall.groupCallId);
  }, [groupCallSpan, groupCallId, groupCall.groupCallId]);

  useEffect(() => () => {
    console.log("LOG ending span");

    groupCallSpan?.end();
  });

  useEffect(() => {
    client.on(RoomStateEvent.Events, onUpdateRoomState);
    //groupCall.on("calls_changed", onCallsChanged);
    groupCall.on(CallEvent.SendVoipEvent, onSendVoipEvent);
    //client.on("state", onCallsChanged);
    //client.on("hangup", onCallHangup);
    client.on(ClientEvent.ReceivedVoipEvent, onReceivedVoipEvent);
    client.on(ClientEvent.UndecryptableToDeviceEvent, onUndecryptableToDevice);

    onUpdateRoomState();

    return () => {
      client.removeListener(RoomStateEvent.Events, onUpdateRoomState);
      //groupCall.removeListener("calls_changed", onCallsChanged);
      groupCall.removeListener(CallEvent.SendVoipEvent, onSendVoipEvent);
      //client.removeListener("state", onCallsChanged);
      //client.removeListener("hangup", onCallHangup);
      client.removeListener(ClientEvent.ReceivedVoipEvent, onReceivedVoipEvent);
      client.removeListener(
        ClientEvent.UndecryptableToDeviceEvent,
        onUndecryptableToDevice
      );
    };
  }, [client, groupCall, onSendVoipEvent, onUpdateRoomState]);
};
