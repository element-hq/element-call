import { useRef, useEffect } from "react";

export function useMediaStream(stream, audioOutputDevice, mute = false) {
  const mediaRef = useRef();

  useEffect(() => {
    console.log(
      `useMediaStream update stream mediaRef.current ${!!mediaRef.current} stream ${
        stream && stream.id
      }`
    );

    if (mediaRef.current) {
      if (stream) {
        mediaRef.current.muted = mute;
        mediaRef.current.srcObject = stream;
        mediaRef.current.play();
      } else {
        mediaRef.current.srcObject = null;
      }
    }
  }, [stream, mute]);

  useEffect(() => {
    if (
      mediaRef.current &&
      audioOutputDevice &&
      mediaRef.current !== undefined
    ) {
      console.log(`useMediaStream setSinkId ${audioOutputDevice}`);
      mediaRef.current.setSinkId(audioOutputDevice);
    }
  }, [audioOutputDevice]);

  useEffect(() => {
    const mediaEl = mediaRef.current;

    return () => {
      if (mediaEl) {
        // Ensure we set srcObject to null before unmounting to prevent memory leak
        // https://webrtchacks.com/srcobject-intervention/
        mediaEl.srcObject = null;
      }
    };
  }, []);

  return mediaRef;
}
