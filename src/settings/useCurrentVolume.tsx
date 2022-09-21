import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import { useState, useEffect } from "react";

import { useClient } from "../ClientContext";

const VOLUME_UPDATE_INTERVAL = 100; // ms

export default function useCurrentVolume() {
  const { client } = useClient();
  const [callFeed, setCallfeed] = useState<CallFeed>();
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    client
      ?.getMediaHandler()
      .getUserMediaStream(true, false)
      .then((stream) => {
        const feed = new CallFeed({
          stream,
          audioMuted: false,
          videoMuted: true,
          roomId: "",
          userId: "",
          client,
          purpose: undefined,
        });
        feed.measureVolumeActivity(true);
        feed.setVoiceActivityThreshold(-Infinity);
        setCallfeed(feed);
      });
  }, [client]);

  useEffect(() => {
    if (!callFeed) return;

    const interval = setInterval(() => {
      setVolume(callFeed.maxVolume);
      console.log(callFeed.maxVolume);
    }, VOLUME_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [callFeed]);

  return { volume };
}
