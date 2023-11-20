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

import { PressEvent } from "@react-types/shared";
import { useTranslation } from "react-i18next";
import { FC } from "react";

import { Modal } from "../Modal";
import { Button } from "../button";
import { FieldRow } from "../input/Input";
import styles from "./JoinExistingCallModal.module.css";

interface Props {
  open: boolean;
  onDismiss: () => void;
  onJoin: (e: PressEvent) => void;
}

export const JoinExistingCallModal: FC<Props> = ({
  onJoin,
  open,
  onDismiss,
}) => {
  const { t } = useTranslation();

  return (
    <Modal title={t("join_existing_call_modal.title")} open={open} onDismiss={onDismiss}>
      <p>{t("join_existing_call_modal.text")}</p>
      <FieldRow rightAlign className={styles.buttons}>
        <Button onPress={onDismiss}>{t("action.no")}</Button>
        <Button onPress={onJoin} data-testid="home_joinExistingRoom">
          {t("join_existing_call_modal.join_button")}
        </Button>
      </FieldRow>
    </Modal>
  );
};
