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

import { Room } from "matrix-js-sdk";
import React from "react";

import { Modal, ModalContent } from "./Modal";
import { Body } from "./typography/Typography";

interface Props {
  userIds: Set<string>;
  room: Room;
}

export const IncompatibleVersionModal: React.FC<Props> = ({
  userIds,
  room,
  ...rest
}) => {
  const userLis = Array.from(userIds).map((u) => (
    <li>{room.getMember(u).name}</li>
  ));

  return (
    <Modal title="Incompatible Versions" isDismissable {...rest}>
      <ModalContent>
        <Body>
          Other users are trying to join this call from incompatible versions.
          These users should ensure that they have refreshed their browsers:
          <ul>{userLis}</ul>
        </Body>
      </ModalContent>
    </Modal>
  );
};
