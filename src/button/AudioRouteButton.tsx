/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useTranslation } from "react-i18next";
import { Button, Tooltip } from "@vector-im/compound-web";
import {
  EarpieceIcon,
  HeadphonesSolidIcon,
  VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import type { ComponentPropsWithoutRef, FC } from "react";
import { RouteType } from "../controls.ts";

interface AudioRouteButtonProps extends ComponentPropsWithoutRef<"button"> {
  size?: "md" | "lg";
  routeType: RouteType;
}

export const AudioRouteButton: FC<AudioRouteButtonProps> = ({
  routeType,
  ...props
}) => {
  const { t } = useTranslation();
  let label: string
  let icon;
  switch(routeType) {
    case RouteType.speaker:
      label = t("settings.devices.loudspeaker")
      icon = VolumeOnSolidIcon;
      break;
    case RouteType.phone:
      label = t("settings.devices.handset");
      icon = EarpieceIcon
      break;
    case RouteType.bluetooth:
      label = "bluetooth headset";
      icon = HeadphonesSolidIcon;
      break;
    case RouteType.wired:
      label = "headset";
      icon = HeadphonesSolidIcon;
      break;
  }

  return (
    <Tooltip label={label}>
      <Button
        iconOnly
        Icon={icon}
        {...props}
        kind={"primary"}
      />
    </Tooltip>
  );
};
