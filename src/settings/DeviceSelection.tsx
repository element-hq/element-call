/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ChangeEvent, type FC, useCallback, useId } from "react";
import {
  Heading,
  InlineField,
  Label,
  RadioControl,
  Separator,
} from "@vector-im/compound-web";
import { useObservableEagerState } from "observable-hooks";
import { t } from "i18next";

import {
  type AudioOutputDeviceLabel,
  type DeviceLabel,
  type SelectedDevice,
  type MediaDevice,
} from "../state/MediaDevices";
import styles from "./DeviceSelection.module.css";

interface Props {
  device: MediaDevice<DeviceLabel | AudioOutputDeviceLabel, SelectedDevice>;
  title: string;
  numberedLabel: (number: number) => string;
}

export function mediaDeviceLabelToString(
  label: DeviceLabel | AudioOutputDeviceLabel,
  numberedLabel: (number: number) => string,
): string {
  let labelText = "";
  switch (label.type) {
    case "name":
      labelText = label.name;
      break;
    case "number":
      labelText = numberedLabel(label.number);
      break;
    case "default":
      labelText =
        label.name === null
          ? t("settings.devices.default")
          : t("settings.devices.default_named", { name: label.name });
      break;
    case "speaker":
      labelText = t("settings.devices.loudspeaker");
      break;
    case "earpiece":
      labelText = t("settings.devices.handset");
      break;
  }
  return labelText;
}

export const DeviceSelection: FC<Props> = ({
  device,
  title,
  numberedLabel,
}) => {
  const groupId = useId();
  const available = useObservableEagerState(device.available$);
  const selectedId = useObservableEagerState(device.selected$)?.id;
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      device.select(e.target.value);
    },
    [device],
  );

  // There is no need to show the menu if there is no choice that can be made.
  if (available.size <= 1) return null;

  return (
    <div className={styles.selection}>
      <Heading
        type="body"
        weight="semibold"
        size="sm"
        as="h4"
        className={styles.title}
      >
        {title}
      </Heading>
      <Separator className={styles.separator} />
      <div className={styles.options}>
        {[...available].map(([id, label]) => {
          const labelText = mediaDeviceLabelToString(label, numberedLabel);
          return (
            <InlineField
              key={id}
              name={groupId}
              control={
                <RadioControl
                  checked={id === selectedId}
                  onChange={onChange}
                  value={id}
                />
              }
            >
              <Label>{labelText}</Label>
            </InlineField>
          );
        })}
      </div>
    </div>
  );
};
