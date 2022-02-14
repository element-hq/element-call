import React, { useState, useCallback } from "react";
import { FullScreenView } from "../FullScreenView";
import { Headline, Subtitle } from "../typography/Typography";
import { createRoom, roomNameFromRoomId } from "../matrix-utils";
import { FieldRow, ErrorMessage, InputField } from "../input/Input";
import { Button } from "../button";
import { Form } from "../form/Form";
import { useHistory } from "react-router-dom";
import styles from "./RoomNotFoundView.module.css";

export function RoomNotFoundView({ client, roomId }) {
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();
  const roomName = roomNameFromRoomId(roomId);
  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();

      async function submit() {
        setError(undefined);
        setLoading(true);

        const roomIdOrAlias = await createRoom(client, roomName);

        if (roomIdOrAlias) {
          history.push(`/room/${roomIdOrAlias}`);
        }
      }

      submit().catch((error) => {
        console.error(error);
        setLoading(false);
        setError(error);
      });
    },
    [client, roomName]
  );

  return (
    <FullScreenView>
      <Headline>Call Not Found</Headline>
      <Subtitle>Would you like to create this call?</Subtitle>
      <Form onSubmit={onSubmit} className={styles.form}>
        <FieldRow>
          <InputField
            id="callName"
            name="callName"
            label="Call name"
            placeholder="Call name"
            type="text"
            required
            autoComplete="off"
            value={roomName}
            disabled
          />
        </FieldRow>
        <FieldRow>
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className={styles.button}
          >
            {loading ? "Loading..." : "Create Room"}
          </Button>
        </FieldRow>
        {error && (
          <FieldRow>
            <ErrorMessage>{error.message}</ErrorMessage>
          </FieldRow>
        )}
      </Form>
    </FullScreenView>
  );
}
