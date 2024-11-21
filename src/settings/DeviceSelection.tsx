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

import { MediaDevice } from "../livekit/MediaDevicesContext";
import styles from "./DeviceSelection.module.css";

interface Props {
  devices: MediaDevice;
  caption: string;
}

export const DeviceSelection: FC<Props> = ({ devices, caption }) => {
  const groupId = useId();
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      devices.select(e.target.value);
    },
    [devices],
  );

  if (devices.available.length == 0) return null;

  return (
    <div className={styles.selection}>
      <Heading
        type="body"
        weight="semibold"
        size="sm"
        as="h4"
        className={styles.title}
      >
        {caption}
      </Heading>
      <Separator className={styles.separator} />
      <div className={styles.options}>
        {devices.available.map(({ deviceId, label }, index) => (
          <InlineField
            key={deviceId}
            name={groupId}
            control={
              <RadioControl
                checked={deviceId === devices.selectedId}
                onChange={onChange}
                value={deviceId}
              />
            }
          >
            <Label>
              {!!label && label.trim().length > 0
                ? label
                : `${caption} ${index + 1}`}
            </Label>
          </InlineField>
        ))}
      </div>
    </div>
  );
};
