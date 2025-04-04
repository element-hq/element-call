/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { Tooltip } from "@vector-im/compound-web";
import { useTranslation } from "react-i18next";
import {
  LockSolidIcon,
  LockOffIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./EncryptionLock.module.css";

interface Props {
  encrypted: boolean;
}

export const EncryptionLock: FC<Props> = ({ encrypted }) => {
  const { t } = useTranslation();
  const Icon = encrypted ? LockSolidIcon : LockOffIcon;
  const label = encrypted ? t("common.encrypted") : t("common.unencrypted");

  return (
    <Tooltip label={label} placement="right" isTriggerInteractive={false}>
      <Icon
        width={16}
        height={16}
        className={styles.lock}
        data-encrypted={encrypted}
      />
    </Tooltip>
  );
};
