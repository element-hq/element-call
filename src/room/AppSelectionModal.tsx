/*
Copyright 2023 New Vector Ltd

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

import { FC, MouseEvent, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@vector-im/compound-web";
import PopOutIcon from "@vector-im/compound-design-tokens/icons/pop-out.svg?react";
import { logger } from "matrix-js-sdk/src/logger";

import { Modal } from "../Modal";
import { useRoomEncryptionSystem } from "../e2ee/sharedKeyManagement";
import { getAbsoluteRoomUrl } from "../utils/matrix";
import styles from "./AppSelectionModal.module.css";
import { editFragmentQuery } from "../UrlParams";
import { E2eeType } from "../e2ee/e2eeType";

interface Props {
  roomId: string;
}

export const AppSelectionModal: FC<Props> = ({ roomId }) => {
  const { t } = useTranslation();

  const [open, setOpen] = useState(true);
  const onBrowserClick = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    },
    [setOpen],
  );
  const e2eeSystem = useRoomEncryptionSystem(roomId);

  if (e2eeSystem.kind === E2eeType.NONE) {
    logger.error(
      "Generating app redirect URL for encrypted room but don't have key available!",
    );
  }

  const appUrl = useMemo(() => {
    // If the room ID is not known, fall back to the URL of the current page
    // Also, we don't really know the room name at this stage as we haven't
    // started a client and synced to get the room details. We could take the one
    // we got in our own URL and use that, but it's not a string that a human
    // ever sees so it's somewhat redundant. We just don't pass a name.
    const url = new URL(
      roomId === null
        ? window.location.href
        : getAbsoluteRoomUrl(roomId, e2eeSystem),
    );
    // Edit the URL to prevent the app selection prompt from appearing a second
    // time within the app, and to keep the user confined to the current room
    url.hash = editFragmentQuery(url.hash, (params) => {
      params.set("appPrompt", "false");
      params.set("confineToRoom", "true");
      return params;
    });

    const result = new URL("io.element.call:/");
    result.searchParams.set("url", url.toString());
    return result.toString();
  }, [e2eeSystem, roomId]);

  return (
    <Modal
      className={styles.modal}
      title={t("app_selection_modal.title")}
      open={open}
    >
      <Text size="md" weight="semibold">
        {t("app_selection_modal.text")}
      </Text>
      <Button kind="secondary" onClick={onBrowserClick}>
        {t("app_selection_modal.continue_in_browser")}
      </Button>
      <Button as="a" href={appUrl} Icon={PopOutIcon}>
        {t("app_selection_modal.open_in_app")}
      </Button>
    </Modal>
  );
};
