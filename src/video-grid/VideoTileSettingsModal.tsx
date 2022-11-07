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
import { useTranslation } from "react-i18next";

import { FieldRow } from "../input/Input";
import { Modal } from "../Modal";
import styles from "./VideoTileSettingsModal.module.css";
import { VolumeIcon } from "../button/VolumeIcon";

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
      <FieldRow>
        <VolumeIcon volume={localVolume} />
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
  onClose: () => void;
}

export const VideoTileSettingsModal = ({ feed, onClose, ...rest }: Props) => {
  const { t } = useTranslation();

  return (
    <Modal
      className={styles.videoTileSettingsModal}
      title={t("Local volume")}
      isDismissable
      mobileFullScreen
      onClose={onClose}
      {...rest}
    >
      <div className={styles.content}>
        <LocalVolume feed={feed} />
      </div>
    </Modal>
  );
};
