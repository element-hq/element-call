/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import React, { useEffect } from "react";

import { Modal, ModalContent } from "../Modal";
import { Button } from "../button";
import { FieldRow, ErrorMessage } from "../input/Input";
import { useSubmitRageshake } from "../settings/submit-rageshake";
import { Body } from "../typography/Typography";

export function RageshakeRequestModal({
  rageshakeRequestId,
  roomId,
  ...rest
}: {
  rageshakeRequestId: string;
  roomId: string;
  onClose: () => void;
  [x: string]: unknown;
}) {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  useEffect(() => {
    if (sent) {
      rest.onClose();
    }
  }, [sent, rest]);

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
