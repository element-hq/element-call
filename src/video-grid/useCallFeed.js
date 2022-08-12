/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { useState, useEffect } from "react";
import { CallFeedEvent } from "matrix-js-sdk/src/webrtc/callFeed";

function getCallFeedState(callFeed) {
  return {
    member: callFeed ? callFeed.getMember() : null,
    isLocal: callFeed ? callFeed.isLocal() : false,
    speaking: callFeed ? callFeed.isSpeaking() : false,
    videoMuted: callFeed ? callFeed.isVideoMuted() : true,
    audioMuted: callFeed ? callFeed.isAudioMuted() : true,
    localVolume: callFeed ? callFeed.getLocalVolume() : 0,
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

    function onLocalVolumeChanged(localVolume) {
      setState((prevState) => ({ ...prevState, localVolume }));
    }

    function onUpdateCallFeed() {
      setState(getCallFeedState(callFeed));
    }

    if (callFeed) {
      callFeed.on(CallFeedEvent.Speaking, onSpeaking);
      callFeed.on(CallFeedEvent.MuteStateChanged, onMuteStateChanged);
      callFeed.on(CallFeedEvent.LocalVolumeChanged, onLocalVolumeChanged);
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
        callFeed.removeListener(
          CallFeedEvent.LocalVolumeChanged,
          onLocalVolumeChanged
        );
        callFeed.removeListener(CallFeedEvent.NewStream, onUpdateCallFeed);
      }
    };
  }, [callFeed]);

  return state;
}
