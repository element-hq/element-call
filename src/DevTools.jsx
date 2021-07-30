import React, { useCallback, useEffect, useRef, useState } from "react";
import ColorHash from "color-hash";
import styles from "./DevTools.module.css";

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

export function DevTools({ manager }) {
  const [debugState, setDebugState] = useState(manager.debugState);
  const [selectedEvent, setSelectedEvent] = useState();

  useEffect(() => {
    function onRoomDebug() {
      setDebugState(manager.debugState);
    }

    manager.on("debug", onRoomDebug);

    return () => {
      manager.removeListener("debug", onRoomDebug);
    };
  }, [manager]);

  if (!manager.joined) {
    return <div className={styles.devTools} />;
  }

  return (
    <div className={styles.devTools}>
      {Array.from(debugState.entries()).map(([userId, props]) => (
        <UserState
          key={userId}
          roomId={manager.roomId}
          onSelectEvent={setSelectedEvent}
          userId={userId}
          {...props}
        />
      ))}
      {selectedEvent && (
        <EventViewer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function UserState({ roomId, userId, state, callId, events, onSelectEvent }) {
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
        <UserId userId={userId} />
        <span>{`(${state})`}</span>
        {callId && <CallId callId={callId} />}
      </div>
      <div ref={eventsRef} className={styles.events} onScroll={onScroll}>
        {events
          .filter((e) => e.roomId === roomId)
          .map((event, idx) => (
            <div
              className={styles.event}
              key={idx}
              onClick={() => onSelectEvent(event)}
            >
              <span className={styles.eventType}>{event.type}</span>
              {event.callId && (
                <CallId className={styles.eventDetails} callId={event.callId} />
              )}
              {event.newCallId && (
                <>
                  <span className={styles.eventDetails}>{"->"}</span>
                  <CallId
                    className={styles.eventDetails}
                    callId={event.newCallId}
                  />
                </>
              )}
              {event.to && (
                <UserId className={styles.eventDetails} userId={event.to} />
              )}
              {event.reason && (
                <span className={styles.eventDetails}>{event.reason}</span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function EventViewer({ event, onClose }) {
  return (
    <div className={styles.eventViewer}>
      <p>Event Type: {event.type}</p>
      {event.callId && (
        <p>
          Call Id: <CallId callId={event.callId} />
        </p>
      )}
      {event.newCallId && (
        <p>
          New Call Id:
          <CallId callId={event.newCallId} />
        </p>
      )}
      {event.to && (
        <p>
          To: <UserId userId={event.to} />
        </p>
      )}
      {event.reason && (
        <p>
          Reason: <span>{event.reason}</span>
        </p>
      )}
      {event.content && (
        <>
          <p>Content:</p>
          <pre className={styles.content}>
            {JSON.stringify(event.content, undefined, 2)}
          </pre>
        </>
      )}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
