import { useState, useEffect, useCallback } from "react";

let audioOutput;

export function useMediaHandler(client) {
  const [{ audioInput, videoInput, audioInputs, videoInputs }, setState] =
    useState(() => {
      const mediaHandler = client.getMediaHandler();

      return {
        audioInput: mediaHandler.audioInput,
        videoInput: mediaHandler.videoInput,
        audioInputs: [],
        videoInputs: [],
      };
    });

  useEffect(() => {
    const mediaHandler = client.getMediaHandler();

    function updateDevices() {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const videoInputs = devices.filter(
          (device) => device.kind === "videoinput"
        );

        setState((prevState) => ({
          audioInput: mediaHandler.audioInput,
          videoInput: mediaHandler.videoInput,
          audioInputs,
          videoInputs,
        }));
      });
    }

    updateDevices();

    mediaHandler.on("local_streams_changed", updateDevices);
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);

    return () => {
      mediaHandler.removeListener("local_streams_changed", updateDevices);
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
    };
  }, []);

  const setAudioInput = useCallback(
    (deviceId) => {
      setState((prevState) => ({ ...prevState, audioInput: deviceId }));
      client.getMediaHandler().setAudioInput(deviceId);
    },
    [client]
  );

  const setVideoInput = useCallback(
    (deviceId) => {
      setState((prevState) => ({ ...prevState, videoInput: deviceId }));
      client.getMediaHandler().setVideoInput(deviceId);
    },
    [client]
  );

  return {
    audioInput,
    audioInputs,
    setAudioInput,
    videoInput,
    videoInputs,
    setVideoInput,
  };
}
