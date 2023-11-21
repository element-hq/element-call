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

import {
  ComponentProps,
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from "react";
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
import MicOnSolidIcon from "@vector-im/compound-design-tokens/icons/mic-on-solid.svg?react";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/icons/mic-off-solid.svg?react";
import ErrorIcon from "@vector-im/compound-design-tokens/icons/error.svg?react";
import { Text, Tooltip } from "@vector-im/compound-web";

import { Avatar } from "../Avatar";
import styles from "./VideoTile.module.css";
import { useReactiveState } from "../useReactiveState";
import { AudioButton, FullscreenButton } from "../button/Button";
import { VideoTileSettingsModal } from "./VideoTileSettingsModal";
import { MatrixInfo } from "../room/VideoPreview";

export interface ItemData {
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
  // TODO: This dependency in particular should probably not be here. We can fix
  // this with a view model.
  matrixInfo: MatrixInfo;
}

export const VideoTile = forwardRef<HTMLDivElement, Props>(
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
      matrixInfo,
    },
    tileRef,
  ) => {
    const { t } = useTranslation();

    const { content, sfuParticipant, member } = data;

    // Handle display name changes.
    const [displayName, setDisplayName] = useReactiveState(
      () => member?.rawDisplayName ?? "[👻]",
      [member],
    );
    useEffect(() => {
      if (member) {
        const updateName = (): void => {
          setDisplayName(member.rawDisplayName);
        };

        member!.on(RoomMemberEvent.Name, updateName);
        return (): void => {
          member!.removeListener(RoomMemberEvent.Name, updateName);
        };
      }
    }, [member, setDisplayName]);

    const audioInfo = useMediaTrack(
      content === TileContent.UserMedia
        ? Track.Source.Microphone
        : Track.Source.ScreenShareAudio,
      sfuParticipant,
    );
    const videoInfo = useMediaTrack(
      content === TileContent.UserMedia
        ? Track.Source.Camera
        : Track.Source.ScreenShare,
      sfuParticipant,
    );
    const muted = audioInfo.isMuted !== false;
    const encrypted =
      audioInfo.publication?.isEncrypted !== false &&
      videoInfo.publication?.isEncrypted !== false;

    const MicIcon = muted ? MicOffSolidIcon : MicOnSolidIcon;

    const onFullscreen = useCallback(() => {
      onToggleFullscreen(data.id);
    }, [data, onToggleFullscreen]);

    const [videoTileSettingsModalOpen, setVideoTileSettingsModalOpen] =
      useState(false);
    const openVideoTileSettingsModal = useCallback(
      () => setVideoTileSettingsModalOpen(true),
      [setVideoTileSettingsModalOpen],
    );
    const closeVideoTileSettingsModal = useCallback(
      () => setVideoTileSettingsModalOpen(false),
      [setVideoTileSettingsModalOpen],
    );

    const toolbarButtons: JSX.Element[] = [];
    if (!sfuParticipant.isLocal) {
      toolbarButtons.push(
        <AudioButton
          key="localVolume"
          className={styles.button}
          volume={(sfuParticipant as RemoteParticipant).getVolume() ?? 0}
          onPress={openVideoTileSettingsModal}
        />,
      );

      if (content === TileContent.ScreenShare) {
        toolbarButtons.push(
          <FullscreenButton
            key="fullscreen"
            className={styles.button}
            fullscreen={fullscreen}
            onPress={onFullscreen}
          />,
        );
      }
    }

    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.isLocal]: sfuParticipant.isLocal,
          [styles.speaking]:
            sfuParticipant.isSpeaking &&
            content === TileContent.UserMedia &&
            showSpeakingIndicator,
          [styles.screenshare]: content === TileContent.ScreenShare,
          [styles.maximised]: maximised,
        })}
        style={style}
        ref={tileRef}
        data-testid="videoTile"
      >
        {toolbarButtons.length > 0 && (!maximised || fullscreen) && (
          <div className={classNames(styles.toolbar)}>{toolbarButtons}</div>
        )}
        {content === TileContent.UserMedia &&
          !sfuParticipant.isCameraEnabled && (
            <>
              <div className={styles.videoMutedOverlay} />
              <Avatar
                key={member?.userId}
                id={member?.userId ?? displayName}
                name={displayName}
                size={Math.round(Math.min(targetWidth, targetHeight) / 2)}
                src={member?.getMxcAvatarUrl()}
                className={styles.avatar}
              />
            </>
          )}
        {content === TileContent.ScreenShare ? (
          <div className={styles.presenterLabel}>
            <span>{t("video_tile.presenter_label", { displayName })}</span>
          </div>
        ) : (
          <div className={styles.nameTag}>
            <MicIcon
              width={20}
              height={20}
              aria-label={muted ? t("microphone_off") : t("microphone_on")}
              data-muted={muted}
              className={styles.muteIcon}
            />
            <Text as="span" size="sm" weight="medium">
              {sfuParticipant.isLocal
                ? t("video_tile.sfu_participant_local")
                : displayName}
            </Text>
            {matrixInfo.roomEncrypted && !encrypted && (
              <Tooltip label={t("common.unencrypted")} side="bottom">
                <ErrorIcon
                  width={20}
                  height={20}
                  aria-label={t("common.unencrypted")}
                  className={styles.errorIcon}
                  // Make the icon focusable so that the tooltip can be opened
                  // with keyboard navigation
                  // TODO: Replace this with the solution from
                  // https://github.com/vector-im/compound-web/pull/130 once it
                  // lands
                  tabIndex={0}
                />
              </Tooltip>
            )}
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
          // There's no reason for this to be focusable
          tabIndex={-1}
          // React supports the disablePictureInPicture attribute, but Firefox
          // only recognizes a value of "true", whereas React sets it to the empty
          // string. So we need to bypass React and set it specifically to "true".
          // https://bugzilla.mozilla.org/show_bug.cgi?id=1865748
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          // eslint-disable-next-line react/no-unknown-property
          disablepictureinpicture="true"
        />
        {!maximised && (
          <VideoTileSettingsModal
            data={data}
            open={videoTileSettingsModalOpen}
            onDismiss={closeVideoTileSettingsModal}
          />
        )}
      </animated.div>
    );
  },
);
