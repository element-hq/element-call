import { SDPStreamMetadataPurpose } from "matrix-js-sdk/src/webrtc/callEventTypes";
import React from "react";
import { useCallFeed } from "./useCallFeed";
import { useMediaStream } from "./useMediaStream";
import { useRoomMemberName } from "./useRoomMemberName";
import { VideoTile } from "./VideoTile";

export function VideoTileContainer({
  item,
  width,
  height,
  getAvatar,
  showName,
  audioOutputDevice,
  disableSpeakingIndicator,
  ...rest
}) {
  const {
    isLocal,
    audioMuted,
    videoMuted,
    noVideo,
    speaking,
    stream,
    purpose,
    member,
  } = useCallFeed(item.callFeed);
  const { rawDisplayName } = useRoomMemberName(member);
  const mediaRef = useMediaStream(stream, audioOutputDevice, isLocal);

  // Firefox doesn't respect the disablePictureInPicture attribute
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

  return (
    <VideoTile
      isLocal={isLocal}
      speaking={speaking && !disableSpeakingIndicator}
      audioMuted={audioMuted}
      noVideo={noVideo}
      videoMuted={videoMuted}
      screenshare={purpose === SDPStreamMetadataPurpose.Screenshare}
      name={rawDisplayName}
      showName={showName}
      mediaRef={mediaRef}
      avatar={getAvatar && getAvatar(member, width, height)}
      {...rest}
    />
  );
}
