/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { InlineSpinner } from "@vector-im/compound-web";

import styles from "./TileAvatar.module.css";
import { Avatar, type Props as AvatarProps } from "../Avatar";

interface Props extends AvatarProps {
  size: number;
  loading?: boolean;
}

export const TileAvatar: FC<Props> = ({ size, loading, ...props }) => {
  return (
    <div>
      {loading && (
        <div className={styles.loading}>
          <InlineSpinner size={size / 3} />
        </div>
      )}
      <Avatar size={size} {...props} />
    </div>
  );
};
