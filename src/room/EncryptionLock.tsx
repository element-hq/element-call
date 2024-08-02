/*
Copyright 2023-2024 New Vector Ltd

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

import { FC } from "react";
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
        aria-hidden
      />
    </Tooltip>
  );
};
