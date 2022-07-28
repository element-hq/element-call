/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { ChangeEvent, useState } from "react";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";

import selectInputStyles from "../input/SelectInput.module.css";
import { FieldRow } from "../input/Input";
import { Modal } from "../Modal";
import styles from "./VideoTileSettingsModal.module.css";

interface LocalVolumeProps {
  feed: CallFeed;
}

const LocalVolume: React.FC<LocalVolumeProps> = ({
  feed,
}: LocalVolumeProps) => {
  const [localVolume, setLocalVolume] = useState<number>(feed.getLocalVolume());

  const onLocalVolumeChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const value: number = +event.target.value;
    setLocalVolume(value);
    feed.setLocalVolume(value);
  };

  return (
    <>
      <h4 className={selectInputStyles.label}> Local Volume </h4>
      <FieldRow>
        <span className={styles.localVolumePercentage}>
          {`${Math.round(localVolume * 100)}%`}
        </span>
        <input
          className={styles.localVolumeSlider}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={localVolume}
          onChange={onLocalVolumeChanged}
        />
      </FieldRow>
    </>
  );
};

// TODO: Extend ModalProps
interface Props {
  feed: CallFeed;
}

export const VideoTileSettingsModal = (props: Props) => {
  return (
    <Modal title="Feed settings" isDismissable mobileFullScreen {...props}>
      <div className={styles.content}>
        <LocalVolume feed={props.feed} />
      </div>
    </Modal>
  );
};
