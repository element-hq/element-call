/*
Copyright 2021 New Vector Ltd

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

import React, { useCallback, useEffect, useRef, useState } from "react";
import ColorHash from "color-hash";
import classNames from "classnames";
import styles from "./DevTools.module.css";
import { Resizable } from "re-resizable";

const colorHash = new ColorHash({ lightness: 0.8 });

function UserId({ userId, ...rest }) {
  const shortUserId = userId.split(":")[0];
  const color = colorHash.hex(shortUserId);
  return (
    <span style={{ color }} {...rest}>
      {shortUserId}
    </span>
  );
}

function CallId({ callId, ...rest }) {
  const shortId = callId.substr(callId.length - 16);
  const color = colorHash.hex(shortId);

  return (
    <span style={{ color }} {...rest}>
      {shortId}
    </span>
  );
}

function sortEntries(a, b) {
  const aInactive = a[1].state === "inactive";
  const bInactive = b[1].state === "inactive";

  if (aInactive && !bInactive) {
    return 1;
  } else if (bInactive && !aInactive) {
    return -1;
  } else {
    return a[0] < b[0] ? -1 : 1;
  }
}

export function DevTools({ callDebugger }) {
  const [debugState, setDebugState] = useState(callDebugger.debugState);
  const [selectedEvent, setSelectedEvent] = useState();
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
    function onRoomDebug() {
      setDebugState({ ...callDebugger.debugState });
    }

    callDebugger.on("debug", onRoomDebug);

    return () => {
      callDebugger.removeListener("debug", onRoomDebug);
    };
  }, [callDebugger]);

  if (!callDebugger.groupCall.entered) {
    return <div className={styles.devTools} />;
  }

  return (
    <Resizable
      enable={{
        top: true,
        right: false,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      className={styles.devTools}
    >
      <div className={styles.toolbar}>
        <div
          className={classNames(styles.tab, {
            [styles.activeTab]: activeTab === "users",
          })}
          onClick={() => setActiveTab("users")}
        >
          Users
        </div>
        <div
          className={classNames(styles.tab, {
            [styles.activeTab]: activeTab === "calls",
          })}
          onClick={() => setActiveTab("calls")}
        >
          Calls
        </div>
      </div>
      <div className={styles.devToolsContainer}>
        {activeTab === "users" &&
          Array.from(debugState.users.entries())
            .sort(sortEntries)
            .map(([userId, props]) => (
              <EventContainer
                key={userId}
                showCallId
                title={<UserId userId={userId} />}
                {...props}
                onSelect={setSelectedEvent}
              />
            ))}
        {activeTab === "calls" &&
          Array.from(debugState.calls.entries())
            .sort(sortEntries)
            .map(([callId, props]) => (
              <EventContainer
                key={callId}
                showSender
                title={<CallId callId={callId} />}
                {...props}
                onSelect={setSelectedEvent}
              />
            ))}
      </div>
      {selectedEvent && (
        <EventViewer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </Resizable>
  );
}

function EventContainer({ title, state, events, ...rest }) {
  const eventsRef = useRef();
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      const el = eventsRef.current;
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
  });

  const onScroll = useCallback(() => {
    const el = eventsRef.current;

    if (el.scrollHeight - el.scrollTop === el.clientHeight) {
      setAutoScroll(true);
    } else {
      setAutoScroll(false);
    }
  }, []);

  return (
    <div className={styles.user}>
      <div className={styles.userId}>
        <span>{title}</span>
        <span>{`(${state})`}</span>
      </div>
      <div ref={eventsRef} className={styles.events} onScroll={onScroll}>
        {events.map((event, idx) => (
          <EventItem key={idx} event={event} {...rest} />
        ))}
      </div>
    </div>
  );
}

function EventItem({ event, showCallId, showSender, onSelect }) {
  const type = event.getType();
  const sender = event.getSender();
  const { call_id, invitee, reason, eventType, ...rest } = event.getContent();

  let eventValue;

  if (eventType === "icegatheringstatechange") {
    eventValue = rest.iceGatheringState;
  } else if (eventType === "iceconnectionstatechange") {
    eventValue = rest.iceConnectionState;
  } else if (eventType === "signalingstatechange") {
    eventValue = rest.signalingState;
  }

  return (
    <div className={styles.event} onClick={() => onSelect(event)}>
      {showSender && sender && (
        <UserId className={styles.eventDetails} userId={sender} />
      )}
      <span className={styles.eventType}>
        {type.replace("me.robertlong.", "x.")}
      </span>
      {showCallId && call_id && (
        <CallId className={styles.eventDetails} callId={call_id} />
      )}
      {invitee && <UserId className={styles.eventDetails} userId={invitee} />}
      {reason && <span className={styles.eventDetails}>{reason}</span>}
      {eventType && <span className={styles.eventDetails}>{eventType}</span>}
      {eventValue && <span className={styles.eventDetails}>{eventValue}</span>}
    </div>
  );
}

function EventViewer({ event, onClose }) {
  const type = event.getType();
  const sender = event.getSender();
  const { call_id, invitee } = event.getContent();
  const json = event.toJSON();

  return (
    <div className={styles.eventViewer}>
      <p>Event Type: {type}</p>
      <p>Sender: {sender}</p>
      {call_id && (
        <p>
          Call Id: <CallId callId={call_id} />
        </p>
      )}
      {invitee && (
        <p>
          Invitee: <UserId userId={invitee} />
        </p>
      )}
      <p>Raw Event:</p>
      <pre className={styles.content}>{JSON.stringify(json, undefined, 2)}</pre>
      <button onClick={onClose}>Close</button>
    </div>
  );
}
