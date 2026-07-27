/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useId, type FC } from "react";
import {
  SpotlightViewIcon,
  GridIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { type LayoutSwitchViewModel } from "../state/LayoutSwitchViewModel";
import { useBehavior } from "../useBehavior";
import { useTranslation } from "react-i18next";
import { Switch } from "@vector-im/compound-web";

interface Props {
  vm: LayoutSwitchViewModel;
  className?: string;
}

export const LayoutSwitch: FC<Props> = ({ vm, className }) => {
  const { t } = useTranslation();
  const layout = useBehavior(vm.layout$);
  const name = useId();

  return (
    <Switch<"spotlight", "grid">
      name={name}
      aria-label={t("layout_switch_label")}
      leftLabel={t("layout_spotlight_label")}
      leftValue="spotlight"
      leftIcon={SpotlightViewIcon}
      rightLabel={t("layout_grid_label")}
      rightValue="grid"
      rightIcon={GridIcon}
      className={className}
      value={layout}
      onChange={vm.setLayout}
    />
  );
};
