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

import React, { HTMLAttributes, useMemo } from "react";
import classNames from "classnames";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { useTranslation } from "react-i18next";

import styles from "./Facepile.module.css";
import { Avatar, Size, sizes } from "./Avatar";

const overlapMap: Partial<Record<Size, number>> = {
  [Size.XS]: 2,
  [Size.SM]: 4,
  [Size.MD]: 8,
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  className: string;
  client: MatrixClient;
  members: RoomMember[];
  max?: number;
  size?: Size;
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

  const _size = sizes.get(size);
  const _overlap = overlapMap[size];

  const title = useMemo(() => {
    return members.reduce<string | null>(
      (prev, curr) =>
        prev === null
          ? curr.name
          : t("{{names}}, {{name}}", { names: prev, name: curr.name }),
      null
    ) as string;
  }, [members, t]);

  return (
    <div
      className={classNames(styles.facepile, styles[size], className)}
      title={title}
      style={{
        width:
          Math.min(members.length, max + 1) * (_size - _overlap) + _overlap,
      }}
      {...rest}
    >
      {members.slice(0, max).map((member, i) => {
        const avatarUrl = member.getMxcAvatarUrl();
        return (
          <Avatar
            key={member.userId}
            size={size}
            src={avatarUrl ?? undefined}
            fallback={member.name.slice(0, 1).toUpperCase()}
            className={styles.avatar}
            style={{ left: i * (_size - _overlap) }}
          />
        );
      })}
      {members.length > max && (
        <Avatar
          key="additional"
          size={size}
          fallback={`+${members.length - max}`}
          className={styles.avatar}
          style={{ left: max * (_size - _overlap) }}
        />
      )}
    </div>
  );
}
