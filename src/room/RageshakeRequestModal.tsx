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
import { Button } from "@vector-im/compound-web";

import { Modal, Props as ModalProps } from "../Modal";
import { FieldRow, ErrorMessage } from "../input/Input";
import { useSubmitRageshake } from "../settings/submit-rageshake";
import { Body } from "../typography/Typography";

interface Props extends Omit<ModalProps, "title" | "children"> {
  rageshakeRequestId: string;
  roomId: string;
  open: boolean;
  onDismiss: () => void;
}

export const RageshakeRequestModal: FC<Props> = ({
  rageshakeRequestId,
  roomId,
  open,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  useEffect(() => {
    if (sent) onDismiss();
  }, [sent, onDismiss]);

  return (
    <Modal
      title={t("rageshake_request_modal.title")}
      open={open}
      onDismiss={onDismiss}
    >
      <Body>{t("rageshake_request_modal.body")}</Body>
      <FieldRow>
        <Button
          onClick={(): void =>
            void submitRageshake({
              sendLogs: true,
              rageshakeRequestId,
              roomId,
            })
          }
          disabled={sending}
        >
          {sending ? t("rageshake_sending_logs") : t("rageshake_send_logs")}
        </Button>
      </FieldRow>
      {error && (
        <FieldRow>
          <ErrorMessage error={error} />
        </FieldRow>
      )}
    </Modal>
  );
};
