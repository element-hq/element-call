import React, { useCallback, useEffect } from "react";
import { Modal, ModalContent } from "../Modal";
import { Button } from "../button";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { useSubmitRageshake, useRageshakeRequest } from "../settings/rageshake";
import { Body } from "../typography/Typography";

export function FeedbackModal({ inCall, roomId, ...rest }) {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();
  const sendRageshakeRequest = useRageshakeRequest();

  const onSubmitFeedback = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const description = data.get("description");
      const sendLogs = data.get("sendLogs");
      submitRageshake({ description, sendLogs });

      if (inCall && sendLogs) {
        sendRageshakeRequest(roomId);
      }
    },
    [inCall, submitRageshake, roomId, sendRageshakeRequest]
  );

  useEffect(() => {
    if (sent) {
      rest.onClose();
    }
  }, [sent, rest.onClose]);

  return (
    <Modal title="Submit Feedback" isDismissable {...rest}>
      <ModalContent>
        <Body>Having trouble? Help us fix it.</Body>
        <form onSubmit={onSubmitFeedback}>
          <FieldRow>
            <InputField
              id="description"
              name="description"
              label="Description (optional)"
              type="text"
            />
          </FieldRow>
          <FieldRow>
            <InputField
              id="sendLogs"
              name="sendLogs"
              label="Include Debug Logs"
              type="checkbox"
              defaultChecked
            />
          </FieldRow>
          {error && (
            <FieldRow>
              <ErrorMessage>{error.message}</ErrorMessage>
            </FieldRow>
          )}
          <FieldRow>
            <Button type="submit" disabled={sending}>
              {sending ? "Submitting feedback..." : "Submit Feedback"}
            </Button>
          </FieldRow>
        </form>
      </ModalContent>
    </Modal>
  );
}
