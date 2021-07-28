import React, { useCallback, useEffect, useRef, useState } from "react";
import ColorHash from "color-hash";
import styles from "./DevTools.module.css";

const colorHash = new ColorHash({ lightness: 0.8 });

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

  useEffect(() => {
    function onRoomDebug() {
      setDebugState(manager.debugState);
    }

    manager.on("debug", onRoomDebug);

    return () => {
      manager.removeListener("debug", onRoomDebug);
    };
  }, [manager]);

  return (
    <div className={styles.devTools}>
      {Array.from(debugState.entries()).map(([userId, props]) => (
        <UserState key={userId} userId={userId} {...props} />
      ))}
    </div>
  );
}

function UserState({ userId, state, callId, events }) {
  const eventsRef = useRef();
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      const el = eventsRef.current;
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
  });

  const onScroll = useCallback((event) => {
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
        <span>{userId}</span>
        {callId && <CallId callId={callId} />}
        <span>{`(${state})`}</span>
      </div>
      <div ref={eventsRef} className={styles.events} onScroll={onScroll}>
        {events.map((event, idx) => (
          <div className={styles.event} key={idx}>
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
              <span className={styles.eventDetails}>{event.to}</span>
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
