import {
  LocalAudioTrack,
  LocalTrack,
  LocalVideoTrack,
  VideoPresets,
  createLocalTracks,
} from "livekit-client";
import { useEffect, useState } from "react";

import { LocalUserChoices } from "./useMediaDevicesChoices";
import { usePreviewDevice } from "@livekit/components-react";
// import { usePreviewDevice } from "./usePreviewDevice";

export interface LocalMediaTracks {
  video: LocalVideoTrack | LocalAudioTrack;
  audio: LocalVideoTrack | LocalAudioTrack;
}

export function useLocalMediaTracks(
  userChoices: LocalUserChoices
): LocalMediaTracks | undefined {
  // trigger permission popup first,
  // useEffect(() => {
  //   navigator.mediaDevices.getUserMedia({
  //     video: { deviceId: selectedVideoId ?? settingsDefaultDevices.videoinput },
  //     audio: { deviceId: selectedAudioId ?? settingsDefaultDevices.audioinput },
  //   });
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // const [tracks, setTracks] = useState<LocalTrack[]>();
  useEffect(() => {
    const videoOptions = {
      deviceId: userChoices.activeVideoDeviceId,
      resolution: VideoPresets.h720.resolution,
    };
    const audioOptions = { deviceId: userChoices.activeAudioDeviceId };

    const createRequiredTracks = async () => {
      const createdTracks = await createLocalTracks({
        video: videoOptions,
        audio: audioOptions,
      });

      // const { videoUnchanged, audioUnchanged } = await checkForNewTracks();
      // const createdTracks = await createLocalTracks({
      //   video: videoUnchanged ? false : videoOptions,
      //   audio: audioUnchanged ? false : audioOptions,
      // });
      // const mergedTracks = [
      //   createdTracks.find((t) => t.kind == "video") ??
      //     tracks.find((t) => t.kind == "video"),
      //   createdTracks.find((t) => t.kind == "audio") ??
      //     tracks.find((t) => t.kind == "audio"),
      // ];
      createdTracks.forEach((t) => t.stop());
      // setTracks(createdTracks); //mergedTracks.filter((t) => t));
    };

    createRequiredTracks();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const video = usePreviewDevice(
    userChoices.videoEnabled,
    userChoices.activeVideoDeviceId,
    "videoinput"
    // tracks?.find((t) => t.kind === "video") as LocalVideoTrack
  );
  const audio = usePreviewDevice(
    userChoices.audioEnabled,
    userChoices.activeAudioDeviceId,
    "audioinput"
    // tracks?.find((track) => track.kind === "audio") as LocalAudioTrack
  );

  // useEffect(() => {
  //   if (audio.localTrack) {
  //     setTracks((currentTracks) =>
  //       currentTracks?.filter((t) => t.kind === "audio")
  //     );
  //   }
  // }, [audio.localTrack]);

  // useEffect(() => {
  //   if (video?.localTrack) {
  //     setTracks((currentTracks) =>
  //       currentTracks?.filter((t) => t.kind === "video")
  //     );
  //   }
  // }, [video.localTrack]);

  return {
    video: video?.localTrack,
    audio: audio?.localTrack,
  };
}
