/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { ChangeEvent, FC, useCallback, useId } from "react";
import {
  Heading,
  InlineField,
  Label,
  RadioControl,
  Separator,
} from "@vector-im/compound-web";
import { useTranslation } from "react-i18next";

import { MediaDevice } from "../livekit/MediaDevicesContext";
import styles from "./DeviceSelection.module.css";

interface Props {
  devices: MediaDevice;
  title: string;
  numberedLabel: (number: number) => string;
}

export const DeviceSelection: FC<Props> = ({
  devices,
  title,
  numberedLabel,
}) => {
  const { t } = useTranslation();
  const groupId = useId();
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      devices.select(e.target.value);
    },
    [devices],
  );

  if (devices.available.size == 0) return null;

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
        {[...devices.available].map(([id, label]) => (
          <InlineField
            key={id}
            name={groupId}
            control={
              <RadioControl
                checked={id === devices.selectedId}
                onChange={onChange}
                value={id}
              />
            }
          >
            <Label>
              {label.type === "name"
                ? label.name
                : label.type === "number"
                  ? numberedLabel(label.number)
                  : t("settings.devices.default")}
            </Label>
          </InlineField>
        ))}
      </div>
    </div>
  );
};
