/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ChangeEvent, type FC, type TouchEvent, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@vector-im/compound-web";
import {
  SpotlightIcon,
  GridIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";

import styles from "./LayoutToggle.module.css";

export type Layout = "spotlight" | "grid";

interface Props {
  layout: Layout;
  setLayout: (layout: Layout) => void;
  className?: string;
  onTouchEnd?: (e: TouchEvent) => void;
}

export const LayoutToggle: FC<Props> = ({
  layout,
  setLayout,
  className,
  onTouchEnd,
}) => {
  const { t } = useTranslation();

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setLayout(e.target.value as Layout),
    [setLayout],
  );

  return (
    <div className={classNames(styles.toggle, className)}>
      <Tooltip label={t("layout_spotlight_label")}>
        <input
          type="radio"
          name="layout"
          value="spotlight"
          checked={layout === "spotlight"}
          onChange={onChange}
          onTouchEnd={onTouchEnd}
        />
      </Tooltip>
      <SpotlightIcon aria-hidden width={24} height={24} />
      <Tooltip label={t("layout_grid_label")}>
        <input
          type="radio"
          name="layout"
          value="grid"
          checked={layout === "grid"}
          onChange={onChange}
          onTouchEnd={onTouchEnd}
        />
      </Tooltip>
      <GridIcon aria-hidden width={24} height={24} />
    </div>
  );
};
