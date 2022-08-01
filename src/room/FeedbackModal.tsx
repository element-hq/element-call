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

import React, { useCallback, useEffect } from "react";
import { randomString } from "matrix-js-sdk/src/randomstring";

import { Modal, ModalContent } from "../Modal";
import { Button } from "../button";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import {
  useSubmitRageshake,
  useRageshakeRequest,
} from "../settings/submit-rageshake";
import { Body } from "../typography/Typography";
interface Props {
  inCall: boolean;
  roomId: string;
  onClose?: () => void;
  // TODO: add all props for for <Modal>
  [index: string]: unknown;
}
export function FeedbackModal({ inCall, roomId, onClose, ...rest }: Props) {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();
  const sendRageshakeRequest = useRageshakeRequest();

  const onSubmitFeedback = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const descriptionData = data.get("description");
      const description =
        typeof descriptionData === "string" ? descriptionData : "";
      const sendLogsData = data.get("sendLogs");
      const sendLogs =
        typeof sendLogsData === "string" ? sendLogsData === "true" : false;
      const rageshakeRequestId = randomString(16);

      submitRageshake({
        description,
        sendLogs,
        rageshakeRequestId,
        roomId,
      });

      if (inCall && sendLogs) {
        sendRageshakeRequest(roomId, rageshakeRequestId);
      }
    },
    [inCall, submitRageshake, roomId, sendRageshakeRequest]
  );

  useEffect(() => {
    if (sent) {
      onClose();
    }
  }, [sent, onClose]);

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
              type="textarea"
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
