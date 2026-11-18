/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";

import { MicButton } from "../button";
import { MediaButtonWithContextMenu } from "./MediaButtonWithContextMenu";
import { AudioContextMenu } from "./AudioContextMenu";
import { type AudioMenuViewModel } from "./MediaMenuViewModel";
import { useBehavior } from "../useBehavior";

interface Props {
  vm: AudioMenuViewModel;
  size: "md" | "lg";
}

/**
 * The microphone's mute button: with a menu to pick the microphone and the
 * speaker while there are microphones to offer, a plain mute button otherwise.
 */
export const AudioMenuButton: FC<Props> = ({ vm, size }) => {
  const { t } = useTranslation();
  const enabled = useBehavior(vm.enabled$);
  const busy = useBehavior(vm.busy$);
  const toggle = useBehavior(vm.toggle$);
  const options = useBehavior(vm.options$);
  const selected = useBehavior(vm.selected$);
  const select = useBehavior(vm.select$);
  const outputOptions = useBehavior(vm.output.options$);
  const selectedOutput = useBehavior(vm.output.selected$);
  const selectOutput = useBehavior(vm.output.select$);

  if (options.length === 0)
    return (
      <MicButton
        size={size}
        enabled={enabled}
        busy={busy}
        onClick={toggle}
        disabled={busy || toggle === undefined}
        data-testid="incall_mute"
      />
    );

  return (
    <MediaButtonWithContextMenu
      muteButton={
        <MicButton
          enabled={enabled}
          busy={busy}
          onClick={(e) => {
            toggle?.();
            e.preventDefault();
            e.stopPropagation();
          }}
          disabled={busy || toggle === undefined}
          data-testid="incall_mute"
        />
      }
      label={t("settings.devices.microphone")}
      title={t("settings.devices.mic_source")}
    >
      <AudioContextMenu
        options={options}
        selectedOption={selected}
        onSelect={select}
        outputOptions={outputOptions}
        selectedOutputOption={selectedOutput}
        onSelectOutput={selectOutput}
      />
    </MediaButtonWithContextMenu>
  );
};
