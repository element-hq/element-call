/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { MicButton, VideoButton } from "../button";
import { MediaMuteAndSwitchButton } from "./MediaMuteAndSwitchButton";
import { type MediaMenuViewModel } from "./MediaMenuViewModel";
import { SelfPreview } from "./SelfPreview";
import { useBehavior } from "../useBehavior";

interface Props {
  vm: MediaMenuViewModel;
  kind: "audio" | "video";
  size: "md" | "lg";
}

/**
 * The microphone's or the camera's mute button: with a menu to pick the
 * device while there are devices to offer, a plain mute button otherwise.
 */
export const MediaMenuButton: FC<Props> = ({ vm, kind, size }) => {
  const { t } = useTranslation();
  const enabled = useBehavior(vm.enabled$);
  const busy = useBehavior(vm.busy$);
  const toggle = useBehavior(vm.toggle$);
  const options = useBehavior(vm.options$);
  const selected = useBehavior(vm.selected$);
  const select = useBehavior(vm.select$);
  const outputOptions = useBehavior(vm.outputOptions$);
  const selectedOutput = useBehavior(vm.selectedOutput$);
  const selectOutput = useBehavior(vm.selectOutput$);
  const backgroundEffect = useBehavior(vm.backgroundEffect$);
  const backgroundEffects = useBehavior(vm.backgroundEffects$);
  const notice = useBehavior(vm.backgroundEffectNotice$);
  const settling = useBehavior(vm.backgroundEffectSettling$);
  const refusal = useBehavior(vm.backgroundImageRefusal$);
  const selectBackgroundEffect = useBehavior(vm.selectBackgroundEffect$);
  const addBackgroundImage = useBehavior(vm.addBackgroundImage$);
  const removeBackgroundEffect = useBehavior(vm.removeBackgroundEffect$);
  const cameraTrack = useBehavior(vm.cameraTrack$);

  const testId = kind === "audio" ? "incall_mute" : "incall_videomute";

  const noticeText = useMemo(() => {
    switch (notice) {
      case undefined:
        return undefined;
      case "unavailable":
        return t("background_effects.unavailable");
      case "slow":
        return t("background_effects.slow");
    }
  }, [notice, t]);
  // A new object for each refusal, so the same one twice is shown twice.
  const refusalMessage = useMemo(() => {
    switch (refusal?.reason) {
      case undefined:
        return undefined;
      case "not-an-image":
        return { text: t("error.background_not_an_image") };
      case "animated":
        return { text: t("error.background_animated") };
      case "undecodable":
        return { text: t("error.background_undecodable") };
      case "not-kept":
        return { text: t("error.background_not_kept") };
    }
  }, [refusal, t]);

  if (options.length === 0) {
    const PlainButton = kind === "audio" ? MicButton : VideoButton;
    return (
      <PlainButton
        size={size}
        enabled={enabled}
        busy={busy}
        onClick={toggle}
        disabled={busy || toggle === undefined}
        data-testid={testId}
      />
    );
  }

  return kind === "audio" ? (
    <MediaMuteAndSwitchButton
      iconsAndLabels="audio"
      enabled={enabled}
      busy={busy}
      onMuteClick={toggle}
      data-testid={testId}
      options={options}
      selectedOption={selected}
      onSelect={select}
      outputOptions={outputOptions}
      selectedOutputOption={selectedOutput}
      onSelectOutput={selectOutput}
    />
  ) : (
    <MediaMuteAndSwitchButton
      iconsAndLabels="video"
      enabled={enabled}
      busy={busy}
      onMuteClick={toggle}
      options={options}
      selectedOption={selected}
      onSelect={select}
      backgroundEffects={backgroundEffects}
      selectedBackgroundEffect={backgroundEffect}
      onSelectBackgroundEffect={selectBackgroundEffect}
      backgroundEffectSettling={settling}
      onAddBackgroundImage={addBackgroundImage}
      onRemoveBackgroundEffect={removeBackgroundEffect}
      selfPreview={<SelfPreview track={cameraTrack} />}
      backgroundImageRefusal={refusalMessage}
      backgroundEffectNotice={noticeText}
    />
  );
};
