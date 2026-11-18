/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useState } from "react";
import { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { VideoButton } from "../button";
import { MediaButtonWithContextMenu } from "./MediaButtonWithContextMenu";
import { CameraContextMenu } from "./CameraContextMenu";
import {
  type BackgroundImageRefusal,
  type CameraMenuViewModel,
} from "./MediaMenuViewModel";
import { SelfPreview } from "./SelfPreview";
import { useBehavior } from "../useBehavior";

interface Props {
  vm: CameraMenuViewModel;
  size: "md" | "lg";
}

/**
 * The camera's mute button: with a menu to pick the camera and the background
 * effect while there are cameras to offer, a plain mute button otherwise.
 */
export const CameraMenuButton: FC<Props> = ({ vm, size }) => {
  const { t } = useTranslation();
  const enabled = useBehavior(vm.enabled$);
  const busy = useBehavior(vm.busy$);
  const toggle = useBehavior(vm.toggle$);
  const options = useBehavior(vm.options$);
  const selected = useBehavior(vm.selected$);
  const select = useBehavior(vm.select$);
  const effects = vm.backgroundEffects;
  const backgroundEffect = useBehavior(effects.selected$);
  const backgroundEffects = useBehavior(effects.available$);
  const notice = useBehavior(effects.notice$);
  const settling = useBehavior(effects.settling$);
  const refusal = useBehavior(effects.imageRefusal$);
  const selectBackgroundEffect = useBehavior(effects.select$);
  const addBackgroundImage = useBehavior(effects.addImage$);
  const removeBackgroundEffect = useBehavior(effects.remove$);
  const cameraTrack = useBehavior(vm.cameraTrack$);

  // A refusal is about the attempt that caused it: shown until dismissed or
  // until the menu closes, and again for the next one.
  const [dismissedRefusal, setDismissedRefusal] =
    useState<BackgroundImageRefusal>();
  const shownRefusal = refusal !== dismissedRefusal ? refusal : undefined;

  if (options.length === 0)
    return (
      <VideoButton
        size={size}
        enabled={enabled}
        busy={busy}
        onClick={toggle}
        disabled={busy || toggle === undefined}
        data-testid="incall_videomute"
      />
    );

  return (
    <MediaButtonWithContextMenu
      muteButton={
        <VideoButton
          enabled={enabled}
          busy={busy}
          onClick={(e) => {
            toggle?.();
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={busy || toggle === undefined}
          data-testid="incall_videomute"
        />
      }
      label={t("settings.devices.camera")}
      title={t("settings.devices.camera_source")}
      onOpenChange={(open) => {
        if (!open) setDismissedRefusal(refusal);
      }}
    >
      <CameraContextMenu
        options={options}
        selectedOption={selected}
        onSelect={select}
        backgroundEffects={backgroundEffects}
        selectedBackgroundEffect={backgroundEffect}
        onSelectBackgroundEffect={selectBackgroundEffect}
        backgroundEffectNotice={noticeText(notice, t)}
        backgroundEffectSettling={settling}
        onAddBackgroundImage={addBackgroundImage}
        onRemoveBackgroundEffect={removeBackgroundEffect}
        backgroundImageRefusal={refusalText(shownRefusal, t)}
        onDismissBackgroundImageRefusal={() => setDismissedRefusal(refusal)}
        selfPreview={<SelfPreview track={cameraTrack} />}
      />
    </MediaButtonWithContextMenu>
  );
};

function noticeText(
  notice: "unavailable" | "slow" | undefined,
  t: TFunction,
): string | undefined {
  switch (notice) {
    case undefined:
      return undefined;
    case "unavailable":
      return t("background_effects.unavailable");
    case "slow":
      return t("background_effects.slow");
  }
}

function refusalText(
  refusal: BackgroundImageRefusal | undefined,
  t: TFunction,
): string | undefined {
  switch (refusal?.reason) {
    case undefined:
      return undefined;
    case "not-an-image":
      return t("error.background_not_an_image");
    case "animated":
      return t("error.background_animated");
    case "undecodable":
      return t("error.background_undecodable");
    case "not-kept":
      return t("error.background_not_kept");
  }
}
