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

import { ComponentProps, forwardRef, Ref, useCallback, useEffect } from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { LocalParticipant, RemoteParticipant, Track } from "livekit-client";
import {
  ConnectionQualityIndicator,
  VideoTrack,
  useMediaTrack,
} from "@livekit/components-react";
import {
  RoomMember,
  RoomMemberEvent,
} from "matrix-js-sdk/src/models/room-member";

import { Avatar } from "../Avatar";
import styles from "./VideoTile.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { useReactiveState } from "../useReactiveState";
import { AudioButton, FullscreenButton } from "../button/Button";
import { useModalTriggerState } from "../Modal";
import { VideoTileSettingsModal } from "./VideoTileSettingsModal";

export interface ItemData {
  type: "real", // To differentiate from FakeItemData
  id: string;
  member?: RoomMember;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;
}

export enum TileContent {
  UserMedia = "user-media",
  ScreenShare = "screen-share",
}

interface Props {
  data: ItemData;
  maximised: boolean;
  fullscreen: boolean;
  onToggleFullscreen: (itemId: string) => void;
  // TODO: Refactor these props.
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  showSpeakingIndicator: boolean;
  showConnectionStats: boolean;
}

export const VideoTile = forwardRef<HTMLElement, Props>(
  (
    {
      data,
      maximised,
      fullscreen,
      onToggleFullscreen,
      className,
      style,
      targetWidth,
      targetHeight,
      showSpeakingIndicator,
      showConnectionStats,
    },
    tileRef
  ) => {
    const { t } = useTranslation();

    const { content, sfuParticipant, member } = data;

    // Handle display name changes.
    const [displayName, setDisplayName] = useReactiveState(
      () => member?.rawDisplayName ?? "[👻]",
      [member]
    );
    useEffect(() => {
      if (member) {
        const updateName = () => {
          setDisplayName(member.rawDisplayName);
        };

        member!.on(RoomMemberEvent.Name, updateName);
        return () => {
          member!.removeListener(RoomMemberEvent.Name, updateName);
        };
      }
    }, [member, setDisplayName]);

    const { isMuted: microphoneMuted } = useMediaTrack(
      content === TileContent.UserMedia
        ? Track.Source.Microphone
        : Track.Source.ScreenShareAudio,
      sfuParticipant
    );

    const onFullscreen = useCallback(() => {
      onToggleFullscreen(data.id);
    }, [data, onToggleFullscreen]);

    const {
      modalState: videoTileSettingsModalState,
      modalProps: videoTileSettingsModalProps,
    } = useModalTriggerState();
    const onOptionsPress = videoTileSettingsModalState.open;

    const toolbarButtons: JSX.Element[] = [];
    if (!sfuParticipant.isLocal) {
      if (content === TileContent.ScreenShare) {
        toolbarButtons.push(
          <FullscreenButton
            key="fullscreen"
            className={styles.button}
            fullscreen={fullscreen}
            onPress={onFullscreen}
          />
        );
      } else {
        // Due to the LK SDK this sadly only works for user-media atm
        toolbarButtons.push(
          <AudioButton
            key="localVolume"
            className={styles.button}
            volume={(sfuParticipant as RemoteParticipant).getVolume() ?? 0}
            onPress={onOptionsPress}
          />
        );
      }
    }

    // Firefox doesn't respect the disablePictureInPicture attribute
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.isLocal]: sfuParticipant.isLocal,
          [styles.speaking]:
            sfuParticipant.isSpeaking &&
            content === TileContent.UserMedia &&
            showSpeakingIndicator,
          [styles.muted]: microphoneMuted,
          [styles.screenshare]: content === TileContent.ScreenShare,
          [styles.maximised]: maximised,
        })}
        style={style}
        ref={tileRef as Ref<HTMLDivElement>}
        data-testid="videoTile"
      >
        {toolbarButtons.length > 0 && (!maximised || fullscreen) && (
          <div className={classNames(styles.toolbar)}>{toolbarButtons}</div>
        )}
        {content === TileContent.UserMedia && !sfuParticipant.isCameraEnabled && (
          <>
            <div className={styles.videoMutedOverlay} />
            <Avatar
              key={member?.userId}
              size={Math.round(Math.min(targetWidth, targetHeight) / 2)}
              src={member?.getMxcAvatarUrl()}
              fallback={displayName.slice(0, 1).toUpperCase()}
              className={styles.avatar}
            />
          </>
        )}
        {content === TileContent.ScreenShare ? (
          <div className={styles.presenterLabel}>
            <span>{t("{{displayName}} is presenting", { displayName })}</span>
          </div>
        ) : (
          <div className={classNames(styles.infoBubble, styles.memberName)}>
            {microphoneMuted === false ? <MicIcon /> : <MicMutedIcon />}
            <span title={displayName}>{displayName}</span>
            {showConnectionStats && (
              <ConnectionQualityIndicator participant={sfuParticipant} />
            )}
          </div>
        )}
        <VideoTrack
          participant={sfuParticipant}
          source={
            content === TileContent.UserMedia
              ? Track.Source.Camera
              : Track.Source.ScreenShare
          }
        />
        {videoTileSettingsModalState.isOpen && !maximised && (
          <VideoTileSettingsModal
            {...videoTileSettingsModalProps}
            data={data}
          />
        )}
      </animated.div>
    );
  }
);
