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

import { Room } from "matrix-js-sdk/src/models/room";
import { FC, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Modal, ModalContent } from "./Modal";
import { Body } from "./typography/Typography";

interface Props {
  userIds: Set<string>;
  room: Room;
  onClose: () => void;
}

export const IncompatibleVersionModal: FC<Props> = ({
  userIds,
  room,
  onClose,
  ...rest
}) => {
  const { t } = useTranslation();
  const userLis = useMemo(
    () => [...userIds].map((u) => <li>{room.getMember(u)?.name ?? u}</li>),
    [userIds, room]
  );

  return (
    <Modal
      title={t("Incompatible versions")}
      isDismissable
      onClose={onClose}
      {...rest}
    >
      <ModalContent>
        <Body>
          <Trans>
            Other users are trying to join this call from incompatible versions.
            These users should ensure that they have refreshed their browsers:
            <ul>{userLis}</ul>
          </Trans>
        </Body>
      </ModalContent>
    </Modal>
  );
};
