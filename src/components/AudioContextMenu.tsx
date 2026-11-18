/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";

import {
  DeviceMenuList,
  DeviceMenuSection,
  MIN_LIST_HEIGHT,
  type MenuOptions,
  useCallAreaShare,
  usePlannedSelection,
} from "./DeviceMenu";
import { LiveMicrophoneLevelMeter } from "./MicrophoneLevelMeter";

/** Id of the placeholder "Default" row, shown when the platform lists no outputs. */
const DEFAULT_OUTPUT_ID = "default";

export interface AudioContextMenuProps {
  options?: MenuOptions[];
  selectedOption?: string;
  onSelect?: (id: string) => void;
  /** Output (speaker) devices. None leaves the speaker section out. */
  outputOptions?: MenuOptions[];
  selectedOutputOption?: string;
  /** Undefined disables the speaker section. */
  onSelectOutput?: (id: string) => void;
}

/** The microphone's menu: the speakers, then the microphones with a level meter. */
export const AudioContextMenu: FC<AudioContextMenuProps> = ({
  options = [],
  selectedOption,
  onSelect,
  outputOptions,
  selectedOutputOption,
  onSelectOutput,
}) => {
  const { t } = useTranslation();
  const share = useCallAreaShare();

  // Safari lists no outputs: show a disabled, selected Default rather than an
  // empty section.
  const noOutputsListed = outputOptions?.length === 0;
  const speakerOptions: MenuOptions[] | undefined = noOutputsListed
    ? [{ id: DEFAULT_OUTPUT_ID, label: { type: "default", name: null } }]
    : outputOptions;
  const selectedSpeaker = noOutputsListed
    ? DEFAULT_OUTPUT_ID
    : selectedOutputOption;

  const { requested, plan, settling } = usePlannedSelection({
    input: { options, selected: selectedOption },
    output: { options: speakerOptions ?? [], selected: selectedSpeaker },
  });

  return (
    <DeviceMenuList maxHeight={Math.max(MIN_LIST_HEIGHT, share.listHeight)}>
      {speakerOptions && (
        <DeviceMenuSection
          title={t("settings.devices.speaker")}
          options={speakerOptions}
          selected={selectedSpeaker}
          onSelect={
            onSelectOutput &&
            ((id): void => {
              plan("output", id);
              onSelectOutput(id);
            })
          }
          numbered={(n) => t("settings.devices.speaker_numbered", { n })}
          requested={requested("output")}
          locked={settling}
        />
      )}
      <DeviceMenuSection
        title={t("settings.devices.microphone")}
        options={options}
        selected={selectedOption}
        onSelect={
          onSelect &&
          ((id): void => {
            plan("input", id);
            onSelect(id);
          })
        }
        numbered={(n) => t("settings.devices.microphone_numbered", { n })}
        requested={requested("input")}
        locked={settling}
        // Drawn only while the menu is open, so the microphone isn't held all
        // call.
        stickyBottomItem={
          <LiveMicrophoneLevelMeter deviceId={selectedOption} active />
        }
      />
    </DeviceMenuList>
  );
};
