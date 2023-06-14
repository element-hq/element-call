/*
Copyright 2022-2023 New Vector Ltd

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

import React, { ComponentProps, forwardRef } from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { LocalParticipant, RemoteParticipant, Track } from "livekit-client";
import {
  ConnectionQualityIndicator,
  VideoTrack,
  useMediaTrack,
} from "@livekit/components-react";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";

import styles from "./VideoTile.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { useRoomMemberName } from "./useRoomMemberName";

export interface ItemData {
  id: string;
  member: RoomMember;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;
}

export enum TileContent {
  UserMedia = "user-media",
  ScreenShare = "screen-share",
}

interface Props {
  data: ItemData;
  className?: string;
  showSpeakingIndicator: boolean;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  getAvatar: (
    roomMember: RoomMember,
    width: number,
    height: number
  ) => JSX.Element;
}

export const VideoTile = forwardRef<HTMLDivElement, Props>(
  (
    {
      data,
      className,
      showSpeakingIndicator,
      style,
      targetWidth,
      targetHeight,
      getAvatar,
    },
    tileRef
  ) => {
    const { t } = useTranslation();

    const { content, sfuParticipant } = data;
    const { rawDisplayName: name } = useRoomMemberName(data.member);

    const audioEl = React.useRef<HTMLAudioElement>(null);
    const { isMuted: microphoneMuted } = useMediaTrack(
      content === TileContent.UserMedia
        ? Track.Source.Microphone
        : Track.Source.ScreenShareAudio,
      sfuParticipant,
      {
        element: audioEl,
      }
    );

    // Firefox doesn't respect the disablePictureInPicture attribute
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.isLocal]: sfuParticipant.isLocal,
          [styles.speaking]: sfuParticipant.isSpeaking && showSpeakingIndicator,
          [styles.muted]: microphoneMuted,
          [styles.screenshare]: content === TileContent.ScreenShare,
        })}
        style={style}
        ref={tileRef}
        data-testid="videoTile"
      >
        {content === TileContent.UserMedia && !sfuParticipant.isCameraEnabled && (
          <>
            <div className={styles.videoMutedOverlay} />
            {getAvatar(data.member, targetWidth, targetHeight)}
          </>
        )}
        {!false &&
          (content === TileContent.ScreenShare ? (
            <div className={styles.presenterLabel}>
              <span>{t("{{name}} is presenting", { name })}</span>
            </div>
          ) : (
            <div className={classNames(styles.infoBubble, styles.memberName)}>
              {microphoneMuted ? <MicMutedIcon /> : <MicIcon />}
              <span title={name}>{name}</span>
              <ConnectionQualityIndicator participant={sfuParticipant} />
            </div>
          ))}
        <VideoTrack
          participant={sfuParticipant}
          source={
            content === TileContent.UserMedia
              ? Track.Source.Camera
              : Track.Source.ScreenShare
          }
        />
        <audio ref={audioEl} />
      </animated.div>
    );
  }
);
