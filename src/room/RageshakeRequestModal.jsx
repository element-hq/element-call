import React, { useEffect } from "react";
import { Modal, ModalContent } from "../Modal";
import { Button } from "../button";
import { FieldRow, ErrorMessage } from "../input/Input";
import { useSubmitRageshake } from "../settings/rageshake";
import { Body } from "../typography/Typography";

export function RageshakeRequestModal(props) {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  useEffect(() => {
    if (sent) {
      props.onClose();
    }
  }, [sent, props.onClose]);

  return (
    <Modal title="Debug Log Request" isDismissable {...props}>
      <ModalContent>
        <Body>
          Another user on this call is having an issue. In order to better
          diagnose these issues we'd like to collect a debug log.
        </Body>
        <FieldRow>
          <Button
            onPress={() => submitRageshake({ sendLogs: true })}
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
