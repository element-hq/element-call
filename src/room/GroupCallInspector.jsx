import { Resizable } from "re-resizable";
import React, { useEffect, useState, useReducer, useRef } from "react";
import ReactJson from "react-json-view";
import mermaid from "mermaid";
import styles from "./GroupCallInspector.module.css";
import { SelectInput } from "../input/SelectInput";
import { Item } from "@react-stately/collections";

function getCallUserId(call) {
  return call.getOpponentMember()?.userId || call.invitee || null;
}

function getCallState(call) {
  return {
    id: call.callId,
    opponentMemberId: getCallUserId(call),
    state: call.state,
    direction: call.direction,
  };
}

function getHangupCallState(call) {
  return {
    ...getCallState(call),
    hangupReason: call.hangupReason,
  };
}

const dateFormatter = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
});

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

function shouldCollapse({ name, src, type, namespace }) {
  return defaultCollapsedFields.includes(name);
}

function getUserName(userId) {
  const match = userId.match("@(.+):");

  return match && match.length > 0 ? match[1].replace("-", " ") : userId;
}

function formatContent(type, content) {
  if (type === "m.call.invite") {
    return `callId: ${content.call_id.slice(-4)} deviceId: ${
      content.device_id
    } sessionId: ${content.session_id}`;
  } else if (type === "m.call.answer") {
    return `callId: ${content.call_id.slice(-4)} deviceId: ${
      content.device_id
    } sessionId: ${content.session_id}`;
  } else if (type === "m.call.select_answer") {
    return `callId: ${content.call_id.slice(-4)} deviceId: ${
      content.device_id
    } sessionId: ${content.session_id}`;
  } else if (type === "m.call.candidates") {
    return `callId: ${content.call_id.slice(-4)} deviceId: ${
      content.device_id
    } sessionId: ${content.session_id}`;
  } else if (type === "m.call.hangup") {
    return `callId: ${content.call_id.slice(-4)} reason: ${
      content.reason
    } deviceId: ${content.device_id} sessionId: ${content.session_id}`;
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
    return `callId: ${call && call["m.call_id"].slice(-4)} deviceId: ${
      device && device.device_id
    } sessionId: ${device && device.session_id}`;
  } else {
    return "";
  }
}

function formatTimestamp(timestamp) {
  return dateFormatter.format(timestamp);
}

function SequenceDiagramViewer({
  localUserId,
  remoteUserIds,
  selectedUserId,
  onSelectUserId,
  events,
}) {
  const mermaidElRef = useRef();

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
      ${
        events
          ? events
              .map(
                ({ to, from, timestamp, type, content }) =>
                  `${getUserName(from)} ->> ${getUserName(
                    to
                  )}: ${formatTimestamp(timestamp)} ${type} ${formatContent(
                    type,
                    content
                  )}`
              )
              .join("\n  ")
          : ""
      }
    `;

    mermaid.mermaidAPI.render("mermaid", graphDefinition, (svgCode) => {
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

function reducer(state, action) {
  switch (action.type) {
    case "receive_room_state_event": {
      const { event, callStateEvent, memberStateEvents } = action;

      let eventsByUserId = state.eventsByUserId;
      let remoteUserIds = state.remoteUserIds;

      if (event) {
        const fromId = event.getStateKey();

        eventsByUserId = new Map(state.eventsByUserId);

        if (event.getStateKey() === state.localUserId) {
          for (const userId in eventsByUserId) {
            eventsByUserId.set(userId, [
              ...(eventsByUserId.get(userId) || []),
              {
                from: fromId,
                to: "Room",
                type: event.getType(),
                content: event.getContent(),
                timestamp: event.getTs() || Date.now(),
              },
            ]);
          }
        } else {
          eventsByUserId.set(fromId, [
            ...(eventsByUserId.get(fromId) || []),
            {
              from: fromId,
              to: "Room",
              type: event.getType(),
              content: event.getContent(),
              timestamp: event.getTs() || Date.now(),
            },
          ]);
        }

        remoteUserIds =
          fromId === state.localUserId || eventsByUserId.has(fromId)
            ? state.remoteUserIds
            : [...state.remoteUserIds, fromId];
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
    case "receive_to_device_event": {
      const event = action.event;
      const eventsByUserId = new Map(state.eventsByUserId);
      const fromId = event.getSender();
      const toId = state.localUserId;

      const remoteUserIds = eventsByUserId.has(fromId)
        ? state.remoteUserIds
        : [...state.remoteUserIds, fromId];

      eventsByUserId.set(fromId, [
        ...(eventsByUserId.get(fromId) || []),
        {
          from: fromId,
          to: toId,
          type: event.getType(),
          content: event.getContent(),
          timestamp: event.getTs() || Date.now(),
        },
      ]);

      return { ...state, eventsByUserId, remoteUserIds };
    }
    case "send_voip_event": {
      const event = action.event;
      const eventsByUserId = new Map(state.eventsByUserId);
      const fromId = state.localUserId;
      const toId = event.userId;

      const remoteUserIds = eventsByUserId.has(toId)
        ? state.remoteUserIds
        : [...state.remoteUserIds, toId];

      eventsByUserId.set(toId, [
        ...(eventsByUserId.get(toId) || []),
        {
          from: fromId,
          to: toId,
          type: event.eventType,
          content: event.content,
          timestamp: Date.now(),
        },
      ]);

      return { ...state, eventsByUserId, remoteUserIds };
    }
    default:
      return state;
  }
}

function useGroupCallState(client, groupCall, pollCallStats) {
  const [state, dispatch] = useReducer(reducer, {
    groupCall,
    localUserId: client.getUserId(),
    eventsByUserId: new Map(),
    remoteUserIds: [],
    callStateEvent: null,
    memberStateEvents: {},
  });

  useEffect(() => {
    function onUpdateRoomState(event) {
      const callStateEvent = groupCall.room.currentState.getStateEvents(
        "org.matrix.msc3401.call",
        groupCall.groupCallId
      );

      const memberStateEvents = groupCall.room.currentState.getStateEvents(
        "org.matrix.msc3401.call.member"
      );

      dispatch({
        type: "receive_room_state_event",
        event,
        callStateEvent,
        memberStateEvents,
      });
    }

    // function onCallsChanged() {
    //   const calls = groupCall.calls.reduce((obj, call) => {
    //     obj[
    //       `${call.callId} (${call.getOpponentMember()?.userId || call.sender})`
    //     ] = getCallState(call);
    //     return obj;
    //   }, {});

    //   updateState({ calls });
    // }

    // function onCallHangup(call) {
    //   setState(({ hangupCalls, ...rest }) => ({
    //     ...rest,
    //     hangupCalls: {
    //       ...hangupCalls,
    //       [`${call.callId} (${
    //         call.getOpponentMember()?.userId || call.sender
    //       })`]: getHangupCallState(call),
    //     },
    //   }));
    //   dispatch({ type: "call_hangup", call });
    // }

    function onToDeviceEvent(event) {
      dispatch({ type: "receive_to_device_event", event });
    }

    function onSendVoipEvent(event) {
      dispatch({ type: "send_voip_event", event });
    }

    client.on("RoomState.events", onUpdateRoomState);
    //groupCall.on("calls_changed", onCallsChanged);
    groupCall.on("send_voip_event", onSendVoipEvent);
    //client.on("state", onCallsChanged);
    //client.on("hangup", onCallHangup);
    client.on("toDeviceEvent", onToDeviceEvent);

    onUpdateRoomState();

    return () => {
      client.removeListener("RoomState.events", onUpdateRoomState);
      //groupCall.removeListener("calls_changed", onCallsChanged);
      groupCall.removeListener("send_voip_event", onSendVoipEvent);
      //client.removeListener("state", onCallsChanged);
      //client.removeListener("hangup", onCallHangup);
      client.removeListener("toDeviceEvent", onToDeviceEvent);
    };
  }, [client, groupCall]);

  // useEffect(() => {
  //   let timeout;

  //   async function updateCallStats() {
  //     const callIds = groupCall.calls.map(
  //       (call) =>
  //         `${call.callId} (${call.getOpponentMember()?.userId || call.sender})`
  //     );
  //     const stats = await Promise.all(
  //       groupCall.calls.map((call) =>
  //         call.peerConn
  //           ? call.peerConn
  //               .getStats(null)
  //               .then((stats) =>
  //                 Object.fromEntries(
  //                   Array.from(stats).map(([_id, report], i) => [
  //                     report.type + i,
  //                     report,
  //                   ])
  //                 )
  //               )
  //           : Promise.resolve(null)
  //       )
  //     );

  //     const callStats = {};

  //     for (let i = 0; i < groupCall.calls.length; i++) {
  //       callStats[callIds[i]] = stats[i];
  //     }

  //     dispatch({ type: "callStats", callStats });
  //     timeout = setTimeout(updateCallStats, 1000);
  //   }

  //   if (pollCallStats) {
  //     updateCallStats();
  //   }

  //   return () => {
  //     clearTimeout(timeout);
  //   };
  // }, [pollCallStats]);

  return state;
}

export function GroupCallInspector({ client, groupCall, show }) {
  const [currentTab, setCurrentTab] = useState("inspector");
  const [selectedUserId, setSelectedUserId] = useState();
  const state = useGroupCallState(client, groupCall, show);

  if (!show) {
    return null;
  }

  return (
    <Resizable
      enable={{ top: true }}
      defaultSize={{ height: 200 }}
      className={styles.inspector}
    >
      <div className={styles.toolbar}>
        <button onClick={() => setCurrentTab("inspector")}>Inspector</button>
        <button onClick={() => setCurrentTab("sequence-diagrams")}>
          Sequence Diagrams
        </button>
      </div>
      {currentTab === "sequence-diagrams" && (
        <SequenceDiagramViewer
          localUserId={state.localUserId}
          selectedUserId={selectedUserId}
          onSelectUserId={setSelectedUserId}
          remoteUserIds={state.remoteUserIds}
          events={state.eventsByUserId.get(selectedUserId)}
        />
      )}
      {currentTab === "inspector" && (
        <ReactJson
          theme="monokai"
          src={{
            ...state,
            eventsByUserId: Object.fromEntries(state.eventsByUserId),
          }}
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
