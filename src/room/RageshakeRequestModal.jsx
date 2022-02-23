import React, { useEffect } from "react";
import { Modal, ModalContent } from "../Modal";
import { Button } from "../button";
import { FieldRow, ErrorMessage } from "../input/Input";
import { useSubmitRageshake } from "../settings/rageshake";
import { Body } from "../typography/Typography";

export function RageshakeRequestModal({ rageshakeRequestId, roomId, ...rest }) {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  useEffect(() => {
    if (sent) {
      rest.onClose();
    }
  }, [sent, rest.onClose]);

  return (
    <Modal title="Debug Log Request" isDismissable {...rest}>
      <ModalContent>
        <Body>
          Another user on this call is having an issue. In order to better
          diagnose these issues we'd like to collect a debug log.
        </Body>
        <FieldRow>
          <Button
            onPress={() =>
              submitRageshake({
                sendLogs: true,
                rageshakeRequestId,
                roomId,
              })
            }
            disabled={sending}
          >
            {sending ? "Sending debug log..." : "Send debug log"}
          </Button>
        </FieldRow>
        {error && (
          <FieldRow>
            <ErrorMessage>{error.message}</ErrorMessage>
          </FieldRow>
        )}
      </ModalContent>
    </Modal>
  );
}
