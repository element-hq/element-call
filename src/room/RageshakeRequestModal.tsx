/*
Copyright 2022 New Vector Ltd

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

import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Modal, ModalContent, ModalProps } from "../Modal";
import { Button } from "../button";
import { FieldRow, ErrorMessage } from "../input/Input";
import { useSubmitRageshake } from "../settings/submit-rageshake";
import { Body } from "../typography/Typography";

interface Props extends Omit<ModalProps, "title" | "children"> {
  rageshakeRequestId: string;
  roomId: string;
  onClose: () => void;
}

export const RageshakeRequestModal: FC<Props> = ({
  rageshakeRequestId,
  roomId,
  ...rest
}) => {
  const { t } = useTranslation();
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  useEffect(() => {
    if (sent) {
      rest.onClose();
    }
  }, [sent, rest]);

  return (
    <Modal title={t("Debug log request")} isDismissable {...rest}>
      <ModalContent>
        <Body>
          {t(
            "Another user on this call is having an issue. In order to better diagnose these issues we'd like to collect a debug log."
          )}
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
            {sending ? t("Sending debug logs…") : t("Send debug logs")}
          </Button>
        </FieldRow>
        {error && (
          <FieldRow>
            <ErrorMessage error={error} />
          </FieldRow>
        )}
      </ModalContent>
    </Modal>
  );
};
