/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import {
  VideoCallSolidIcon,
  VoiceCallSolidIcon,
  EndCallIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useTranslation } from "react-i18next";

import { type RingingMediaViewModel } from "../state/media/RingingMediaViewModel";
import { useBehavior } from "../useBehavior";

interface Props {
  vm: RingingMediaViewModel;
}

export const RingingStatus: FC<Props> = ({ vm }) => {
  const { t } = useTranslation();
  const pickupState = useBehavior(vm.pickupState$);
  const Icon =
    pickupState === "ringing"
      ? vm.intent === "video"
        ? VideoCallSolidIcon
        : VoiceCallSolidIcon
      : EndCallIcon;

  return (
    <>
      <Icon aria-hidden />
      {pickupState === "ringing"
        ? t("video_tile.calling")
        : t("video_tile.call_ended")}
    </>
  );
};
