/*
Copyright 2022 - 2023 New Vector Ltd

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
import { useTranslation } from "react-i18next";
import { RemoteParticipant, Track } from "livekit-client";

import { FieldRow } from "../input/Input";
import { Modal } from "../Modal";
import styles from "./VideoTileSettingsModal.module.css";
import { VolumeIcon } from "../button/VolumeIcon";
import { ItemData, TileContent } from "./VideoTile";

interface LocalVolumeProps {
  participant: RemoteParticipant;
  content: TileContent;
}

const LocalVolume: React.FC<LocalVolumeProps> = ({
  participant,
  content,
}: LocalVolumeProps) => {
  const source =
    content === TileContent.UserMedia
      ? Track.Source.Microphone
      : Track.Source.ScreenShareAudio;

  const [localVolume, setLocalVolume] = useState<number>(
    participant.getVolume(source) ?? 0
  );

  const onLocalVolumeChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const value: number = +event.target.value;
    setLocalVolume(value);
    participant.setVolume(value, source);
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
  data: ItemData;
  onClose: () => void;
}

export const VideoTileSettingsModal = ({ data, onClose, ...rest }: Props) => {
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
        <LocalVolume
          participant={data.sfuParticipant as RemoteParticipant}
          content={data.content}
        />
      </div>
    </Modal>
  );
};
