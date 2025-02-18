/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useTranslation } from "react-i18next";
import { type FC, type MouseEvent } from "react";
import { Button } from "@vector-im/compound-web";

import { Modal } from "../Modal";
import { FieldRow } from "../input/Input";
import styles from "./JoinExistingCallModal.module.css";

interface Props {
  open: boolean;
  onDismiss: () => void;
  onJoin: (e: MouseEvent) => void;
}

export const JoinExistingCallModal: FC<Props> = ({
  onJoin,
  open,
  onDismiss,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      title={t("join_existing_call_modal.title")}
      open={open}
      onDismiss={onDismiss}
    >
      <p>{t("join_existing_call_modal.text")}</p>
      <FieldRow rightAlign className={styles.buttons}>
        <Button onClick={onDismiss}>{t("action.no")}</Button>
        <Button onClick={onJoin} data-testid="home_joinExistingRoom">
          {t("join_existing_call_modal.join_button")}
        </Button>
      </FieldRow>
    </Modal>
  );
};
