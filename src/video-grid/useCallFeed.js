import { useState, useEffect } from "react";
import { CallFeedEvent } from "matrix-js-sdk/src/webrtc/callFeed";

function getCallFeedState(callFeed) {
  return {
    member: callFeed ? callFeed.getMember() : null,
    isLocal: callFeed ? callFeed.isLocal() : false,
    speaking: callFeed ? callFeed.isSpeaking() : false,
    noVideo: callFeed
      ? !callFeed.stream || callFeed.stream.getVideoTracks().length === 0
      : true,
    videoMuted: callFeed ? callFeed.isVideoMuted() : true,
    audioMuted: callFeed ? callFeed.isAudioMuted() : true,
    stream: callFeed ? callFeed.stream : undefined,
    purpose: callFeed ? callFeed.purpose : undefined,
  };
}

export function useCallFeed(callFeed) {
  const [state, setState] = useState(() => getCallFeedState(callFeed));

  useEffect(() => {
    function onSpeaking(speaking) {
      setState((prevState) => ({ ...prevState, speaking }));
    }

    function onMuteStateChanged(audioMuted, videoMuted) {
      setState((prevState) => ({ ...prevState, audioMuted, videoMuted }));
    }

    function onUpdateCallFeed() {
      setState(getCallFeedState(callFeed));
    }

    if (callFeed) {
      callFeed.on(CallFeedEvent.Speaking, onSpeaking);
      callFeed.on(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
      callFeed.on(CallFeedEvent.NewStream, onUpdateCallFeed);
    }

    onUpdateCallFeed();

    return () => {
      if (callFeed) {
        callFeed.removeListener(CallFeedEvent.Speaking, onSpeaking);
        callFeed.removeListener(
          CallFeedEvent.MuteStateChanged,
          onMuteStateChanged
        );
        callFeed.removeListener(CallFeedEvent.NewStream, onUpdateCallFeed);
      }
    };
  }, [callFeed]);

  return state;
}
