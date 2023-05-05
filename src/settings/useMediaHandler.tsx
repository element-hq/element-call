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

/* eslint-disable @typescript-eslint/ban-ts-comment */

import { MediaHandlerEvent } from "matrix-js-sdk/src/webrtc/mediaHandler";
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  createContext,
  ReactNode,
} from "react";

import { useClient } from "../ClientContext";

export interface MediaHandlerContextInterface {
  audioInput: string;
  audioInputs: MediaDeviceInfo[];
  setAudioInput: (deviceId: string) => void;
  videoInput: string;
  videoInputs: MediaDeviceInfo[];
  setVideoInput: (deviceId: string) => void;
  audioOutput: string;
  audioOutputs: MediaDeviceInfo[];
  setAudioOutput: (deviceId: string) => void;
}

const MediaHandlerContext =
  createContext<MediaHandlerContextInterface>(undefined);

interface MediaPreferences {
  audioInput?: string;
  videoInput?: string;
  audioOutput?: string;
}
function getMediaPreferences(): MediaPreferences {
  const mediaPreferences = localStorage.getItem("matrix-media-preferences");

  if (mediaPreferences) {
    try {
      return JSON.parse(mediaPreferences);
    } catch (e) {
      return undefined;
    }
  } else {
    return undefined;
  }
}

function updateMediaPreferences(newPreferences: MediaPreferences): void {
  const oldPreferences = getMediaPreferences();

  localStorage.setItem(
    "matrix-media-preferences",
    JSON.stringify({
      ...oldPreferences,
      ...newPreferences,
    })
  );
}
interface Props {
  children: ReactNode;
}
export function MediaHandlerProvider({ children }: Props): JSX.Element {
  const { client } = useClient();
  const [
    {
      audioInput,
      videoInput,
      audioInputs,
      videoInputs,
      audioOutput,
      audioOutputs,
    },
    setState,
  ] = useState(() => {
    const mediaHandler = client?.getMediaHandler();

    if (mediaHandler) {
      const mediaPreferences = getMediaPreferences();
      mediaHandler?.restoreMediaSettings(
        mediaPreferences?.audioInput,
        mediaPreferences?.videoInput
      );
    }

    return {
      // @ts-ignore, ignore that audioInput is a private members of mediaHandler
      audioInput: mediaHandler?.audioInput,
      // @ts-ignore, ignore that videoInput is a private members of mediaHandler
      videoInput: mediaHandler?.videoInput,
      audioOutput: undefined,
      audioInputs: [],
      videoInputs: [],
      audioOutputs: [],
    };
  });

  useEffect(() => {
    if (!client) return;

    const mediaHandler = client.getMediaHandler();

    function updateDevices(): void {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const mediaPreferences = getMediaPreferences();

        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const audioConnected = audioInputs.some(
          // @ts-ignore
          (device) => device.deviceId === mediaHandler.audioInput
        );
        // @ts-ignore
        let audioInput = mediaHandler.audioInput;

        if (!audioConnected && audioInputs.length > 0) {
          audioInput = audioInputs[0].deviceId;
        }

        const videoInputs = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const videoConnected = videoInputs.some(
          // @ts-ignore
          (device) => device.deviceId === mediaHandler.videoInput
        );

        // @ts-ignore
        let videoInput = mediaHandler.videoInput;

        if (!videoConnected && videoInputs.length > 0) {
          videoInput = videoInputs[0].deviceId;
        }

        const audioOutputs = devices.filter(
          (device) => device.kind === "audiooutput"
        );
        let audioOutput = undefined;

        if (
          mediaPreferences &&
          audioOutputs.some(
            (device) => device.deviceId === mediaPreferences.audioOutput
          )
        ) {
          audioOutput = mediaPreferences.audioOutput;
        }

        if (
          // @ts-ignore
          (mediaHandler.videoInput && mediaHandler.videoInput !== videoInput) ||
          // @ts-ignore
          mediaHandler.audioInput !== audioInput
        ) {
          mediaHandler.setMediaInputs(audioInput, videoInput);
        }

        updateMediaPreferences({ audioInput, videoInput, audioOutput });

        setState({
          audioInput,
          videoInput,
          audioOutput,
          audioInputs,
          videoInputs,
          audioOutputs,
        });
      });
    }
    updateDevices();

    mediaHandler.on(MediaHandlerEvent.LocalStreamsChanged, updateDevices);
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);

    return () => {
      mediaHandler.removeListener(
        MediaHandlerEvent.LocalStreamsChanged,
        updateDevices
      );
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
      mediaHandler.stopAllStreams();
    };
  }, [client]);

  const setAudioInput: (deviceId: string) => void = useCallback(
    (deviceId: string) => {
      updateMediaPreferences({ audioInput: deviceId });
      setState((prevState) => ({ ...prevState, audioInput: deviceId }));
      client.getMediaHandler().setAudioInput(deviceId);
    },
    [client]
  );

  const setVideoInput: (deviceId: string) => void = useCallback(
    (deviceId) => {
      updateMediaPreferences({ videoInput: deviceId });
      setState((prevState) => ({ ...prevState, videoInput: deviceId }));
      client.getMediaHandler().setVideoInput(deviceId);
    },
    [client]
  );

  const setAudioOutput: (deviceId: string) => void = useCallback((deviceId) => {
    updateMediaPreferences({ audioOutput: deviceId });
    setState((prevState) => ({ ...prevState, audioOutput: deviceId }));
  }, []);

  const context: MediaHandlerContextInterface =
    useMemo<MediaHandlerContextInterface>(
      () => ({
        audioInput,
        audioInputs,
        setAudioInput,
        videoInput,
        videoInputs,
        setVideoInput,
        audioOutput,
        audioOutputs,
        setAudioOutput,
      }),
      [
        audioInput,
        audioInputs,
        setAudioInput,
        videoInput,
        videoInputs,
        setVideoInput,
        audioOutput,
        audioOutputs,
        setAudioOutput,
      ]
    );

  return (
    <MediaHandlerContext.Provider value={context}>
      {children}
    </MediaHandlerContext.Provider>
  );
}

export function useMediaHandler() {
  return useContext(MediaHandlerContext);
}
