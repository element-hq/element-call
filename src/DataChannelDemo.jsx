import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, FieldRow, InputField } from "./Input";
import styles from "./DataChannelDemo.module.css";

export function DataChannelDemo({ manager }) {
  const messageRef = useRef();
  const [messages, setMessages] = useState([]);

  const sendMessage = useCallback(
    (e) => {
      e.preventDefault();
      const message = messageRef.current.value;
      manager.sendMessage(message);
      const text = `${manager.client.getUserId()}: ${message}`;
      setMessages((messages) => [...messages, text]);
      messageRef.current.value = "";
    },
    [manager]
  );

  useEffect(() => {
    function onMessage(participant, message) {
      const text = `${participant.userId}: ${message}`;
      setMessages((messages) => [...messages, text]);
    }

    manager.on("message", onMessage);

    return () => {
      manager.removeListener("message", onMessage);
    };
  }, [manager]);

  return (
    <div className={styles.container}>
      <h3>WebRTC DataChannel Chat</h3>
      <div className={styles.messages}>
        {messages.map((message, i) => {
          return <p key={i}>{message}</p>;
        })}
      </div>
      <form onSubmit={sendMessage}>
        <FieldRow>
          <InputField
            label="Message"
            placeholder="Message..."
            ref={messageRef}
          />
          <Button type="submit">Send Message</Button>
        </FieldRow>
      </form>
    </div>
  );
}
