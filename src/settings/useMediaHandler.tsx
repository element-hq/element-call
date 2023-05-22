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

import { MatrixClient } from "matrix-js-sdk/src/client";
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  createContext,
  ReactNode,
  useRef,
} from "react";

import { useClient } from "../ClientContext";
import { getNamedDevices } from "../media-utils";

export interface MediaHandlerContextInterface {
  audioInput: string | undefined;
  audioInputs: MediaDeviceInfo[];
  setAudioInput: (deviceId: string) => void;
  videoInput: string | undefined;
  videoInputs: MediaDeviceInfo[];
  setVideoInput: (deviceId: string) => void;
  audioOutput: string | undefined;
  audioOutputs: MediaDeviceInfo[];
  setAudioOutput: (deviceId: string) => void;
  /**
   * A hook which requests for devices to be named. This requires media
   * permissions.
   */
  useDeviceNames: () => void;
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
      return {};
    }
  } else {
    return {};
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
  ] = useState(() => ({
    audioInput: undefined as string | undefined,
    videoInput: undefined as string | undefined,
    audioOutput: undefined as string | undefined,
    audioInputs: [] as MediaDeviceInfo[],
    videoInputs: [] as MediaDeviceInfo[],
    audioOutputs: [] as MediaDeviceInfo[],
  }));

  // A ref counting the number of components currently mounted that want
  // to know device names
  const numComponentsWantingNames = useRef(0);

  const updateDevices = useCallback(
    async (client: MatrixClient, initial: boolean) => {
      // Only request device names if components actually want them, because it
      // could trigger an extra permission pop-up
      const devices = await (numComponentsWantingNames.current > 0
        ? getNamedDevices()
        : navigator.mediaDevices.enumerateDevices());
      const mediaPreferences = getMediaPreferences();

      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");

      const audioInput = (
        mediaPreferences.audioInput === undefined
          ? audioInputs.at(0)
          : audioInputs.find(
              (d) => d.deviceId === mediaPreferences.audioInput
            ) ?? audioInputs.at(0)
      )?.deviceId;
      const videoInput = (
        mediaPreferences.videoInput === undefined
          ? videoInputs.at(0)
          : videoInputs.find(
              (d) => d.deviceId === mediaPreferences.videoInput
            ) ?? videoInputs.at(0)
      )?.deviceId;
      const audioOutput =
        mediaPreferences.audioOutput === undefined
          ? undefined
          : audioOutputs.find(
              (d) => d.deviceId === mediaPreferences.audioOutput
            )?.deviceId;

      updateMediaPreferences({ audioInput, videoInput, audioOutput });
      setState({
        audioInput,
        videoInput,
        audioOutput,
        audioInputs,
        videoInputs,
        audioOutputs,
      });

      if (
        initial ||
        audioInput !== mediaPreferences.audioInput ||
        videoInput !== mediaPreferences.videoInput
      ) {
        client.getMediaHandler().setMediaInputs(audioInput, videoInput);
      }
    },
    [setState]
  );

  const useDeviceNames = useCallback(() => {
    // This is a little weird from React's perspective as it looks like a
    // dynamic hook, but it works
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (client) {
        numComponentsWantingNames.current++;
        if (numComponentsWantingNames.current === 1)
          updateDevices(client, false);
        return () => void numComponentsWantingNames.current--;
      }
    }, []);
  }, [client, updateDevices]);

  useEffect(() => {
    if (client) {
      updateDevices(client, true);
      const onDeviceChange = () => updateDevices(client, false);
      navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);

      return () => {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          onDeviceChange
        );
        client.getMediaHandler().stopAllStreams();
      };
    }
  }, [client, updateDevices]);

  const setAudioInput: (deviceId: string) => void = useCallback(
    (deviceId: string) => {
      updateMediaPreferences({ audioInput: deviceId });
      setState((prevState) => ({ ...prevState, audioInput: deviceId }));
      client?.getMediaHandler().setAudioInput(deviceId);
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
        useDeviceNames,
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
        useDeviceNames,
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
