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

import React, { HTMLAttributes } from "react";
import classNames from "classnames";
import { MatrixClient, RoomMember } from "matrix-js-sdk";

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
  participants: RoomMember[];
  max?: number;
  size?: Size;
}

export function Facepile({
  className,
  client,
  participants,
  max = 3,
  size = Size.XS,
  ...rest
}: Props) {
  const _size = sizes.get(size);
  const _overlap = overlapMap[size];

  return (
    <div
      className={classNames(styles.facepile, styles[size], className)}
      title={participants.map((member) => member.name).join(", ")}
      style={{
        width:
          Math.min(participants.length, max + 1) * (_size - _overlap) +
          _overlap,
      }}
      {...rest}
    >
      {participants.slice(0, max).map((member, i) => {
        const avatarUrl = member.user?.avatarUrl;
        return (
          <Avatar
            key={member.userId}
            size={size}
            src={avatarUrl}
            fallback={member.name.slice(0, 1).toUpperCase()}
            className={styles.avatar}
            style={{ left: i * (_size - _overlap) }}
          />
        );
      })}
      {participants.length > max && (
        <Avatar
          key="additional"
          size={size}
          fallback={`+${participants.length - max}`}
          className={styles.avatar}
          style={{ left: max * (_size - _overlap) }}
        />
      )}
    </div>
  );
}
