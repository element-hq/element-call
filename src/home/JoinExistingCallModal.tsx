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

import { Modal, ModalContent } from "../Modal";
import { Button } from "../button";
import { FieldRow } from "../input/Input";
import styles from "./JoinExistingCallModal.module.css";
import { useEnableE2EE } from "../settings/useSetting";

interface Props {
  onJoin: (e: PressEvent) => void;
  onClose: () => void;
  // TODO: add used parameters for <Modal>
  [index: string]: unknown;
}
export function JoinExistingCallModal({ onJoin, onClose, ...rest }: Props) {
  const { t } = useTranslation();
  const [e2eeEnabled] = useEnableE2EE();

  return (
    <Modal
      title={
        e2eeEnabled ? t("This call already exists") : t("Join existing call?")
      }
      isDismissable
      {...rest}
      onClose={onClose}
    >
      <ModalContent>
        <p>
          {e2eeEnabled
            ? t(
                "This call already exists, please join using a URL retrieved using the in-app copy link button"
              )
            : t("This call already exists, would you like to join?")}
        </p>
        <FieldRow rightAlign className={styles.buttons}>
          {e2eeEnabled ? (
            <Button onPress={onClose}>{t("Ok")}</Button>
          ) : (
            <>
              <Button onPress={onClose}>{t("No")}</Button>
              <Button onPress={onJoin} data-testid="home_joinExistingRoom">
                {t("Yes, join call")}
              </Button>
            </>
          )}
        </FieldRow>
      </ModalContent>
    </Modal>
  );
}
