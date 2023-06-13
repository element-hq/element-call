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

import React, { ComponentProps, forwardRef, useCallback } from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { SDPStreamMetadataPurpose } from "matrix-js-sdk/src/webrtc/callEventTypes";

import styles from "./VideoTile.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as MicMutedIcon } from "../icons/MicMuted.svg";
import { AudioButton, FullscreenButton } from "../button/Button";
import { ConnectionState } from "../room/useGroupCall";
import { TileDescriptor } from "./TileDescriptor";
import { VideoTileSettingsModal } from "./VideoTileSettingsModal";
import { useCallFeed } from "./useCallFeed";
import { useSpatialMediaStream } from "./useMediaStream";
import { useRoomMemberName } from "./useRoomMemberName";
import { useModalTriggerState } from "../Modal";
import { useMergedRefs } from "../useMergedRefs";

interface Props {
  item: TileDescriptor;
  maximised: boolean;
  fullscreen: boolean;
  onFullscreen: (participant: TileDescriptor) => void;
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
  audioContext: AudioContext;
  audioDestination: AudioNode;
}

export const VideoTile = forwardRef<HTMLElement, Props>(
  (
    {
      item,
      maximised,
      fullscreen,
      onFullscreen,
      className,
      showSpeakingIndicator,
      style,
      targetWidth,
      targetHeight,
      getAvatar,
      audioContext,
      audioDestination,
    },
    tileRef1
  ) => {
    const { t } = useTranslation();

    const {
      isLocal,
      audioMuted,
      videoMuted,
      localVolume,
      hasAudio,
      speaking,
      stream,
      purpose,
    } = useCallFeed(item.callFeed);
    const screenshare = purpose === SDPStreamMetadataPurpose.Screenshare;
    const { rawDisplayName: name } = useRoomMemberName(item.member);

    const [tileRef2, mediaRef] = useSpatialMediaStream(
      stream ?? null,
      audioContext,
      audioDestination,
      localVolume,
      // The feed is muted if it's local audio (because we don't want our own audio,
      // but it's a hook and we can't call it conditionally so we're stuck with it)
      // or if there's a maximised feed in which case we always render audio via audio
      // elements because we wire it up at the video tile container level and only one
      // video tile container is displayed.
      isLocal || maximised
    );

    const tileRef = useMergedRefs(tileRef1, tileRef2);

    const {
      modalState: videoTileSettingsModalState,
      modalProps: videoTileSettingsModalProps,
    } = useModalTriggerState();
    const onOptionsPress = videoTileSettingsModalState.open;

    const onFullscreenCallback = useCallback(() => {
      onFullscreen(item);
    }, [onFullscreen, item]);

    const toolbarButtons: JSX.Element[] = [];
    if (item.connectionState == ConnectionState.Connected && !isLocal) {
      if (hasAudio) {
        toolbarButtons.push(
          <AudioButton
            key="localVolume"
            className={styles.button}
            volume={localVolume}
            onPress={onOptionsPress}
          />
        );
      }

      if (screenshare) {
        toolbarButtons.push(
          <FullscreenButton
            key="fullscreen"
            className={styles.button}
            fullscreen={fullscreen}
            onPress={onFullscreenCallback}
          />
        );
      }
    }

    let caption: string;
    switch (item.connectionState) {
      case ConnectionState.EstablishingCall:
        caption = t("{{name}} (Connecting...)", { name });
        break;
      case ConnectionState.WaitMedia:
        // not strictly true, but probably easier to understand than, "Waiting for media"
        caption = t("{{name}} (Waiting for video...)", { name });
        break;
      case ConnectionState.Connected:
        caption = name;
        break;
    }

    // Firefox doesn't respect the disablePictureInPicture attribute
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

    return (
      <>
        <animated.div
          className={classNames(styles.videoTile, className, {
            [styles.isLocal]: isLocal,
            [styles.speaking]: speaking && showSpeakingIndicator,
            [styles.muted]: audioMuted,
            [styles.screenshare]: screenshare,
            [styles.maximised]: maximised,
          })}
          style={style}
          ref={tileRef}
          data-testid="videoTile"
        >
          {toolbarButtons.length > 0 && !maximised && (
            <div className={classNames(styles.toolbar)}>{toolbarButtons}</div>
          )}
          {videoMuted && (
            <>
              <div className={styles.videoMutedOverlay} />
              {getAvatar(item.member, targetWidth, targetHeight)}
            </>
          )}
          {!maximised &&
            (screenshare ? (
              <div className={styles.presenterLabel}>
                <span>{t("{{name}} is presenting", { name })}</span>
              </div>
            ) : (
              <div className={classNames(styles.infoBubble, styles.memberName)}>
                {
                  /* If the user is speaking, it's safe to say they're unmuted.
                Mute state is currently sent over to-device messages, which
                aren't quite real-time, so this is an important kludge to make
                sure no one appears muted when they've clearly begun talking. */
                  speaking || !audioMuted ? <MicIcon /> : <MicMutedIcon />
                }
                <span data-testid="videoTile_caption" title={caption}>
                  {caption}
                </span>
              </div>
            ))}
          <video
            data-testid="videoTile_video"
            ref={mediaRef}
            playsInline
            disablePictureInPicture
          />
        </animated.div>
        {videoTileSettingsModalState.isOpen && !maximised && item.callFeed && (
          <VideoTileSettingsModal
            {...videoTileSettingsModalProps}
            feed={item.callFeed}
          />
        )}
      </>
    );
  }
);
