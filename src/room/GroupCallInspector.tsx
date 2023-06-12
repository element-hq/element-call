/*
Copyright 2022 New Vector Ltd

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

import * as Sentry from "@sentry/react";
import { Resizable } from "re-resizable";
import React, {
  useEffect,
  useState,
  useReducer,
  useRef,
  createContext,
  useContext,
} from "react";
import ReactJson, { CollapsedFieldProps } from "react-json-view";
import mermaid from "mermaid";
import { Item } from "@react-stately/collections";
import { MatrixEvent, IContent } from "matrix-js-sdk/src/models/event";
import {
  GroupCall,
  GroupCallError,
  GroupCallEvent,
} from "matrix-js-sdk/src/webrtc/groupCall";
import { ClientEvent, MatrixClient } from "matrix-js-sdk/src/client";
import { RoomStateEvent } from "matrix-js-sdk/src/models/room-state";
import {
  CallEvent,
  CallState,
  CallError,
  MatrixCall,
  VoipEvent,
} from "matrix-js-sdk/src/webrtc/call";

import styles from "./GroupCallInspector.module.css";
import { SelectInput } from "../input/SelectInput";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";

interface InspectorContextState {
  eventsByUserId?: { [userId: string]: SequenceDiagramMatrixEvent[] };
  remoteUserIds?: string[];
  localUserId?: string;
  localSessionId?: string;
}

const defaultCollapsedFields = [
  "org.matrix.msc3401.call",
  "org.matrix.msc3401.call.member",
  "calls",
  "callStats",
  "hangupCalls",
  "toDeviceEvents",
  "sentVoipEvents",
  "content",
];

function shouldCollapse({ name }: CollapsedFieldProps) {
  return defaultCollapsedFields.includes(name);
}

function getUserName(userId: string) {
  const match = userId.match(/@([^:]+):/);

  return match && match.length > 0
    ? match[1].replace("-", " ").replace(/\W/g, "")
    : userId.replace(/\W/g, "");
}

function formatContent(type: string, content: CallEventContent) {
  if (type === "m.call.hangup") {
    return `callId: ${content.call_id.slice(-4)} reason: ${
      content.reason
    } senderSID: ${content.sender_session_id} destSID: ${
      content.dest_session_id
    }`;
  }
  if (type.startsWith("m.call.")) {
    return `callId: ${content.call_id?.slice(-4)} senderSID: ${
      content.sender_session_id
    } destSID: ${content.dest_session_id}`;
  } else if (type === "org.matrix.msc3401.call.member") {
    const call =
      content["m.calls"] &&
      content["m.calls"].length > 0 &&
      content["m.calls"][0];
    const device =
      call &&
      call["m.devices"] &&
      call["m.devices"].length > 0 &&
      call["m.devices"][0];
    return `conf_id: ${call && call["m.call_id"].slice(-4)} sessionId: ${
      device && device.session_id
    }`;
  } else {
    return "";
  }
}

const dateFormatter = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore the linter does not know about this property of the DataTimeFormatOptions
  fractionalSecondDigits: 3,
});

function formatTimestamp(timestamp: number | Date) {
  return dateFormatter.format(timestamp);
}

function formatType(event: SequenceDiagramMatrixEvent): string {
  if (event.content.msgtype === "m.bad.encrypted") return "Undecryptable";
  return event.type;
}

function lineForEvent(event: SequenceDiagramMatrixEvent): string {
  return `${getUserName(event.from)} ${
    event.ignored ? "-x" : "->>"
  } ${getUserName(event.to)}: ${formatTimestamp(event.timestamp)} ${formatType(
    event
  )} ${formatContent(event.type, event.content)}`;
}

export const InspectorContext =
  createContext<
    [
      InspectorContextState,
      React.Dispatch<React.SetStateAction<InspectorContextState>>
    ]
  >(undefined);

export function InspectorContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // We take the tuple of [currentState, setter] and stick
  // it straight into the context for other things to call
  // the setState method... this feels like a fairly severe
  // contortion of the hooks API - is this really the best way
  // to do this?
  const context = useState<InspectorContextState>({});
  return (
    <InspectorContext.Provider value={context}>
      {children}
    </InspectorContext.Provider>
  );
}

type CallEventContent = {
  ["m.calls"]: {
    ["m.devices"]: { session_id: string; [x: string]: unknown }[];
    ["m.call_id"]: string;
  }[];
} & {
  call_id: string;
  reason: string;
  sender_session_id: string;
  dest_session_id: string;
} & IContent;

export type SequenceDiagramMatrixEvent = {
  to: string;
  from: string;
  timestamp: number;
  type: string;
  content: CallEventContent;
  ignored: boolean;
};

interface SequenceDiagramViewerProps {
  localUserId: string;
  remoteUserIds: string[];
  selectedUserId: string;
  onSelectUserId: (userId: string) => void;
  events: SequenceDiagramMatrixEvent[];
}

export function SequenceDiagramViewer({
  localUserId,
  remoteUserIds,
  selectedUserId,
  onSelectUserId,
  events,
}: SequenceDiagramViewerProps) {
  const mermaidElRef = useRef<HTMLDivElement>();

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: true,
      theme: "dark",
      sequence: {
        showSequenceNumbers: true,
      },
    });
  }, []);

  useEffect(() => {
    const graphDefinition = `sequenceDiagram
      participant ${getUserName(localUserId)}
      participant Room
      participant ${selectedUserId ? getUserName(selectedUserId) : "unknown"}
      ${events ? events.map(lineForEvent).join("\n  ") : ""}
    `;

    mermaid.mermaidAPI.render("mermaid", graphDefinition, (svgCode: string) => {
      mermaidElRef.current.innerHTML = svgCode;
    });
  }, [events, localUserId, selectedUserId]);

  return (
    <div className={styles.scrollContainer}>
      <div className={styles.sequenceDiagramViewer}>
        <SelectInput
          className={styles.selectInput}
          label="Remote User"
          selectedKey={selectedUserId}
          onSelectionChange={onSelectUserId}
        >
          {remoteUserIds.map((userId) => (
            <Item key={userId}>{userId}</Item>
          ))}
        </SelectInput>
        <div id="mermaid" />
        <div ref={mermaidElRef} />
      </div>
    </div>
  );
}

function reducer(
  state: InspectorContextState,
  action: {
    type?: CallEvent | ClientEvent | RoomStateEvent;
    event?: MatrixEvent;
    rawEvent?: VoipEvent;
    callStateEvent?: MatrixEvent;
    memberStateEvents?: MatrixEvent[];
  }
) {
  switch (action.type) {
    case RoomStateEvent.Events: {
      const { event, callStateEvent, memberStateEvents } = action;

      let eventsByUserId = state.eventsByUserId;
      let remoteUserIds = state.remoteUserIds;

      if (event) {
        const fromId = event.getStateKey();

        remoteUserIds =
          fromId === state.localUserId || eventsByUserId[fromId]
            ? state.remoteUserIds
            : [...state.remoteUserIds, fromId];

        eventsByUserId = { ...state.eventsByUserId };

        if (event.getStateKey() === state.localUserId) {
          for (const userId in eventsByUserId) {
            eventsByUserId[userId] = [
              ...(eventsByUserId[userId] || []),
              {
                from: fromId,
                to: "Room",
                type: event.getType(),
                content: event.getContent(),
                timestamp: event.getTs() || Date.now(),
                ignored: false,
              },
            ];
          }
        } else {
          eventsByUserId[fromId] = [
            ...(eventsByUserId[fromId] || []),
            {
              from: fromId,
              to: "Room",
              type: event.getType(),
              content: event.getContent(),
              timestamp: event.getTs() || Date.now(),
              ignored: false,
            },
          ];
        }
      }

      return {
        ...state,
        eventsByUserId,
        remoteUserIds,
        callStateEvent: callStateEvent.getContent(),
        memberStateEvents: Object.fromEntries(
          memberStateEvents.map((e) => [e.getStateKey(), e.getContent()])
        ),
      };
    }
    case ClientEvent.ReceivedVoipEvent: {
      const event = action.event;
      const eventsByUserId = { ...state.eventsByUserId };
      const fromId = event.getSender();
      const toId = state.localUserId;
      const content = event.getContent<CallEventContent>();

      const remoteUserIds = eventsByUserId[fromId]
        ? state.remoteUserIds
        : [...state.remoteUserIds, fromId];

      eventsByUserId[fromId] = [
        ...(eventsByUserId[fromId] || []),
        {
          from: fromId,
          to: toId,
          type: event.getType(),
          content,
          timestamp: event.getTs() || Date.now(),
          ignored: state.localSessionId !== content.dest_session_id,
        },
      ];

      return { ...state, eventsByUserId, remoteUserIds };
    }
    case CallEvent.SendVoipEvent: {
      const event = action.rawEvent;
      const eventsByUserId = { ...state.eventsByUserId };
      const fromId = state.localUserId;
      const toId = event.userId as string;

      const remoteUserIds = eventsByUserId[toId]
        ? state.remoteUserIds
        : [...state.remoteUserIds, toId];

      eventsByUserId[toId] = [
        ...(eventsByUserId[toId] || []),
        {
          from: fromId,
          to: toId,
          type: event.eventType as string,
          content: event.content as CallEventContent,
          timestamp: Date.now(),
          ignored: false,
        },
      ];

      return { ...state, eventsByUserId, remoteUserIds };
    }
    default:
      return state;
  }
}

function useGroupCallState(
  client: MatrixClient,
  groupCall: GroupCall,
  otelGroupCallMembership: OTelGroupCallMembership
): InspectorContextState {
  const [state, dispatch] = useReducer(reducer, {
    localUserId: client.getUserId(),
    localSessionId: client.getSessionId(),
    eventsByUserId: {},
    remoteUserIds: [],
    callStateEvent: null,
    memberStateEvents: {},
  });

  useEffect(() => {
    function onUpdateRoomState(event?: MatrixEvent) {
      const callStateEvent = groupCall.room.currentState.getStateEvents(
        "org.matrix.msc3401.call",
        groupCall.groupCallId
      );

      const memberStateEvents = groupCall.room.currentState.getStateEvents(
        "org.matrix.msc3401.call.member"
      );

      dispatch({
        type: RoomStateEvent.Events,
        event,
        callStateEvent,
        memberStateEvents,
      });

      otelGroupCallMembership?.onUpdateRoomState(event);
    }

    function onReceivedVoipEvent(event: MatrixEvent) {
      dispatch({ type: ClientEvent.ReceivedVoipEvent, event });

      otelGroupCallMembership?.onReceivedVoipEvent(event);
    }

    function onSendVoipEvent(event: VoipEvent, call: MatrixCall) {
      dispatch({ type: CallEvent.SendVoipEvent, rawEvent: event });

      otelGroupCallMembership?.onSendEvent(call, event);
    }

    function onCallStateChange(
      newState: CallState,
      _: CallState,
      call: MatrixCall
    ) {
      otelGroupCallMembership?.onCallStateChange(call, newState);
    }

    function onCallError(error: CallError, call: MatrixCall) {
      otelGroupCallMembership.onCallError(error, call);
    }

    function onGroupCallError(error: GroupCallError) {
      otelGroupCallMembership.onGroupCallError(error);
    }

    function onUndecryptableToDevice(event: MatrixEvent) {
      dispatch({ type: ClientEvent.ReceivedVoipEvent, event });

      Sentry.captureMessage("Undecryptable to-device Event");
      // probably unnecessary if it's now captured via otel?
      PosthogAnalytics.instance.eventUndecryptableToDevice.track(
        groupCall.groupCallId
      );

      otelGroupCallMembership.onUndecryptableToDevice(event);
    }

    client.on(RoomStateEvent.Events, onUpdateRoomState);
    groupCall.on(CallEvent.SendVoipEvent, onSendVoipEvent);
    groupCall.on(CallEvent.State, onCallStateChange);
    groupCall.on(CallEvent.Error, onCallError);
    groupCall.on(GroupCallEvent.Error, onGroupCallError);
    //client.on("state", onCallsChanged);
    //client.on("hangup", onCallHangup);
    client.on(ClientEvent.ReceivedVoipEvent, onReceivedVoipEvent);
    client.on(ClientEvent.UndecryptableToDeviceEvent, onUndecryptableToDevice);

    onUpdateRoomState();

    return () => {
      client.removeListener(RoomStateEvent.Events, onUpdateRoomState);
      groupCall.removeListener(CallEvent.SendVoipEvent, onSendVoipEvent);
      groupCall.removeListener(CallEvent.State, onCallStateChange);
      groupCall.removeListener(CallEvent.Error, onCallError);
      groupCall.removeListener(GroupCallEvent.Error, onGroupCallError);
      //client.removeListener("state", onCallsChanged);
      //client.removeListener("hangup", onCallHangup);
      client.removeListener(ClientEvent.ReceivedVoipEvent, onReceivedVoipEvent);
      client.removeListener(
        ClientEvent.UndecryptableToDeviceEvent,
        onUndecryptableToDevice
      );
    };
  }, [client, groupCall, otelGroupCallMembership]);

  return state;
}

interface GroupCallInspectorProps {
  client: MatrixClient;
  groupCall: GroupCall;
  otelGroupCallMembership: OTelGroupCallMembership;
  show: boolean;
}

export function GroupCallInspector({
  client,
  groupCall,
  otelGroupCallMembership,
  show,
}: GroupCallInspectorProps) {
  const [currentTab, setCurrentTab] = useState("sequence-diagrams");
  const [selectedUserId, setSelectedUserId] = useState<string>();
  const state = useGroupCallState(client, groupCall, otelGroupCallMembership);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setState] = useContext(InspectorContext);

  useEffect(() => {
    setState(state);
  }, [setState, state]);

  if (!show) {
    return null;
  }

  return (
    <Resizable
      enable={{ top: true }}
      defaultSize={{ height: 200, width: undefined }}
      className={styles.inspector}
    >
      <div className={styles.toolbar}>
        <button onClick={() => setCurrentTab("sequence-diagrams")}>
          Sequence Diagrams
        </button>
        <button onClick={() => setCurrentTab("inspector")}>Inspector</button>
      </div>
      {currentTab === "sequence-diagrams" && (
        <SequenceDiagramViewer
          localUserId={state.localUserId}
          selectedUserId={selectedUserId}
          onSelectUserId={setSelectedUserId}
          remoteUserIds={state.remoteUserIds}
          events={state.eventsByUserId[selectedUserId]}
        />
      )}
      {currentTab === "inspector" && (
        <ReactJson
          theme="monokai"
          src={state}
          name={null}
          indentWidth={2}
          shouldCollapse={shouldCollapse}
          displayDataTypes={false}
          displayObjectSize={false}
          enableClipboard
          style={{ height: "100%", overflowY: "scroll" }}
        />
      )}
    </Resizable>
  );
}
