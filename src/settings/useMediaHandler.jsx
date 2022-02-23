import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  createContext,
} from "react";

const MediaHandlerContext = createContext();

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
    const mediaHandler = client.getMediaHandler();

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
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        const videoInputs = devices.filter(
          (device) => device.kind === "videoinput"
        );
        const audioOutputs = devices.filter(
          (device) => device.kind === "audiooutput"
        );

        let audioOutput = undefined;

        const audioOutputPreference = localStorage.getItem(
          "matrix-audio-output"
        );

        if (
          audioOutputPreference &&
          audioOutputs.some(
            (device) => device.deviceId === audioOutputPreference
          )
        ) {
          audioOutput = audioOutputPreference;
        }

        setState({
          audioInput: mediaHandler.audioInput,
          videoInput: mediaHandler.videoInput,
          audioOutput,
          audioInputs,
          audioOutputs,
          videoInputs,
        });
      });
    }

    updateDevices();

    mediaHandler.on("local_streams_changed", updateDevices);
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);

    return () => {
      mediaHandler.removeListener("local_streams_changed", updateDevices);
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
    };
  }, [client]);

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

  const setAudioOutput = useCallback((deviceId) => {
    localStorage.setItem("matrix-audio-output", deviceId);
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
