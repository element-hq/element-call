/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { SDPStreamMetadataPurpose } from "matrix-js-sdk/src/webrtc/callEventTypes";
import React from "react";
import { useCallback } from "react";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";

import { useCallFeed } from "./useCallFeed";
import { useSpatialMediaStream } from "./useMediaStream";
import { useRoomMemberName } from "./useRoomMemberName";
import { VideoTile } from "./VideoTile";
import { VideoTileSettingsModal } from "./VideoTileSettingsModal";
import { useModalTriggerState } from "../Modal";
import { TileDescriptor } from "../room/InCallView";

interface Props {
  item: TileDescriptor;
  width?: number;
  height?: number;
  getAvatar: (
    roomMember: RoomMember,
    width: number,
    height: number
  ) => JSX.Element;
  audioContext: AudioContext;
  audioDestination: AudioNode;
  disableSpeakingIndicator: boolean;
  maximised: boolean;
  fullscreen: boolean;
  onFullscreen: (item: TileDescriptor) => void;
}

export function VideoTileContainer({
  item,
  width,
  height,
  getAvatar,
  audioContext,
  audioDestination,
  disableSpeakingIndicator,
  maximised,
  fullscreen,
  onFullscreen,
  ...rest
}: Props) {
  const {
    isLocal,
    audioMuted,
    videoMuted,
    localVolume,
    speaking,
    stream,
    purpose,
  } = useCallFeed(item.callFeed);
  const { rawDisplayName } = useRoomMemberName(item.member);
  const [tileRef, mediaRef] = useSpatialMediaStream(
    stream ?? null,
    audioContext,
    audioDestination,
    localVolume,
    isLocal || maximised
  );
  const {
    modalState: videoTileSettingsModalState,
    modalProps: videoTileSettingsModalProps,
  } = useModalTriggerState();
  const onOptionsPress = () => {
    videoTileSettingsModalState.open();
  };

  const onFullscreenCallback = useCallback(() => {
    onFullscreen(item);
  }, [onFullscreen, item]);

  // Firefox doesn't respect the disablePictureInPicture attribute
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

  return (
    <>
      <VideoTile
        isLocal={isLocal}
        speaking={speaking && !disableSpeakingIndicator}
        audioMuted={audioMuted}
        videoMuted={videoMuted}
        screenshare={purpose === SDPStreamMetadataPurpose.Screenshare}
        name={rawDisplayName}
        hasFeed={Boolean(item.callFeed)}
        ref={tileRef}
        mediaRef={mediaRef}
        avatar={getAvatar && getAvatar(item.member, width, height)}
        onOptionsPress={onOptionsPress}
        localVolume={localVolume}
        maximised={maximised}
        fullscreen={fullscreen}
        onFullscreen={onFullscreenCallback}
        {...rest}
      />
      {videoTileSettingsModalState.isOpen && !maximised && item.callFeed && (
        <VideoTileSettingsModal
          {...videoTileSettingsModalProps}
          feed={item.callFeed}
        />
      )}
    </>
  );
}
