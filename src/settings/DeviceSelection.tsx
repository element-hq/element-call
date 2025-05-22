/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ChangeEvent,
  type FC,
  type ReactElement,
  type ReactNode,
  useCallback,
  useId,
} from "react";
import {
  Heading,
  InlineField,
  Label,
  RadioControl,
  Separator,
} from "@vector-im/compound-web";
import { Trans, useTranslation } from "react-i18next";

import {
  EARPIECE_CONFIG_ID,
  type MediaDeviceHandle,
} from "../livekit/MediaDevicesContext";
import styles from "./DeviceSelection.module.css";

interface Props {
  device: MediaDeviceHandle;
  title: string;
  numberedLabel: (number: number) => string;
}

export const DeviceSelection: FC<Props> = ({
  device,
  title,
  numberedLabel,
}) => {
  const { t } = useTranslation();
  const groupId = useId();
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      device.select(e.target.value);
    },
    [device],
  );

  // There is no need to show the menu if there is no choice that can be made.
  if (device.available.size <= 1) return null;

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
        {[...device.available].map(([id, label]) => {
          let labelText: ReactNode;
          switch (label.type) {
            case "name":
              labelText = label.name;
              break;
            case "number":
              labelText = numberedLabel(label.number);
              break;
            case "default":
              labelText =
                label.name === null ? (
                  t("settings.devices.default")
                ) : (
                  <Trans
                    i18nKey="settings.devices.default_named"
                    name={label.name}
                  >
                    Default{" "}
                    <span className={styles.secondary}>
                      ({{ name: label.name } as unknown as ReactElement})
                    </span>
                  </Trans>
                );
              break;
            case "earpiece":
              labelText = t("settings.devices.earpiece");
              break;
          }

          let isSelected = false;
          if (device.useAsEarpiece) {
            isSelected = id === EARPIECE_CONFIG_ID;
          } else {
            isSelected = id === device.selectedId;
          }

          return (
            <InlineField
              key={id}
              name={groupId}
              control={
                <RadioControl
                  checked={isSelected}
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
