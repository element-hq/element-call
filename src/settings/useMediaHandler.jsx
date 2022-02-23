import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  createContext,
} from "react";

const MediaHandlerContext = createContext();

function getMediaPreferences() {
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

function updateMediaPreferences(newPreferences) {
  const oldPreferences = getMediaPreferences(newPreferences);

  localStorage.setItem(
    "matrix-media-preferences",
    JSON.stringify({
      ...oldPreferences,
      ...newPreferences,
    })
  );
}

export function MediaHandlerProvider({ client, children }) {
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
    const mediaPreferences = getMediaPreferences();
    const mediaHandler = client.getMediaHandler();

    mediaHandler.restoreMediaSettings(
      mediaPreferences?.audioInput,
      mediaPreferences?.videoInput
    );

    return {
      audioInput: mediaHandler.audioInput,
      videoInput: mediaHandler.videoInput,
      audioOutput: undefined,
      audioInputs: [],
      videoInputs: [],
      audioOutputs: [],
    };
  });

  useEffect(() => {
    const mediaHandler = client.getMediaHandler();

    function updateDevices() {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const mediaPreferences = getMediaPreferences();

        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const audioConnected = audioInputs.some(
          (device) => device.deviceId === mediaHandler.audioInput
        );

        let audioInput = mediaHandler.audioInput;

        if (!audioConnected && audioInputs.length > 0) {
          audioInput = audioInputs[0].deviceId;
        }

        const videoInputs = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const videoConnected = videoInputs.some(
          (device) => device.deviceId === mediaHandler.videoInput
        );

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
          mediaHandler.videoInput !== videoInput ||
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

    mediaHandler.on("local_streams_changed", updateDevices);
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);

    return () => {
      mediaHandler.removeListener("local_streams_changed", updateDevices);
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
      mediaHandler.stopAllStreams();
    };
  }, [client]);

  const setAudioInput = useCallback(
    (deviceId) => {
      updateMediaPreferences({ audioInput: deviceId });
      setState((prevState) => ({ ...prevState, audioInput: deviceId }));
      client.getMediaHandler().setAudioInput(deviceId);
    },
    [client]
  );

  const setVideoInput = useCallback(
    (deviceId) => {
      updateMediaPreferences({ videoInput: deviceId });
      setState((prevState) => ({ ...prevState, videoInput: deviceId }));
      client.getMediaHandler().setVideoInput(deviceId);
    },
    [client]
  );

  const setAudioOutput = useCallback((deviceId) => {
    updateMediaPreferences({ audioOutput: deviceId });
    setState((prevState) => ({ ...prevState, audioOutput: deviceId }));
  }, []);

  const context = useMemo(
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
