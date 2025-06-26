/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { BigIcon, Button, Heading, Text } from "@vector-im/compound-web";
import { EarpieceIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { useTranslation } from "react-i18next";

import styles from "./EarpieceOverlay.module.css";

interface Props {
  show: boolean;
  onBackToVideoPressed?: (() => void) | null;
}

export const EarpieceOverlay: FC<Props> = ({ show, onBackToVideoPressed }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.overlay} data-show={show}>
      <BigIcon className={styles.icon}>
        <EarpieceIcon aria-hidden />
      </BigIcon>
      <Heading as="h2" weight="semibold" size="md">
        {t("earpiece.overlay_title")}
      </Heading>
      <Text>{t("earpiece.overlay_description")}</Text>
      <Button
        kind="primary"
        size="sm"
        onClick={() => {
          onBackToVideoPressed?.();
        }}
      >
        {t("earpiece.overlay_back_button")}
      </Button>
    </div>
  );
};
