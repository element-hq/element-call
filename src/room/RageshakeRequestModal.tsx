/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@vector-im/compound-web";

import { Modal, type Props as ModalProps } from "../Modal";
import { FieldRow, ErrorMessage } from "../input/Input";
import { useSubmitRageshake } from "../settings/submit-rageshake";

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
      <Text>{t("rageshake_request_modal.body")}</Text>
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
