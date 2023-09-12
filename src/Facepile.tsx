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

import { HTMLAttributes } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { useTranslation } from "react-i18next";
import { AvatarStack } from "@vector-im/compound-web";

import { Avatar, Size } from "./Avatar";

interface Props extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  client: MatrixClient;
  members: RoomMember[];
  max?: number;
  size?: Size | number;
}

export function Facepile({
  className,
  client,
  members,
  max = 3,
  size = Size.XS,
  ...rest
}: Props) {
  const { t } = useTranslation();

  const displayedMembers = members.slice(0, max);

  return (
    <AvatarStack
      title={t("{{names, list(style: short;)}}", {
        list: displayedMembers.map((m) => m.name),
      })}
      {...rest}
    >
      {displayedMembers.map((member, i) => {
        const avatarUrl = member.getMxcAvatarUrl();
        return (
          <Avatar
            key={i}
            id={member.userId}
            name={member.name}
            size={size}
            src={avatarUrl ?? undefined}
          />
        );
      })}
    </AvatarStack>
  );
}
