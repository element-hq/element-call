/*
Copyright 2022 New Vector Ltd

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

import React, { useEffect, useRef } from "react";

import { Participant } from "../room/InCallView";
import { useCallFeed } from "./useCallFeed";
import { useMediaStreamTrackCount } from "./useMediaStream";

// XXX: These in fact do not render anything but to my knowledge this is the
// only way to a hook on an array

interface AudioForParticipantProps {
  item: Participant;
  audioContext: AudioContext;
  audioDestination: AudioNode;
}

export function AudioForParticipant({
  item,
  audioContext,
  audioDestination,
}: AudioForParticipantProps): JSX.Element {
  const { stream, localVolume, audioMuted } = useCallFeed(item.callFeed);
  const [audioTrackCount] = useMediaStreamTrackCount(stream);

  const gainNodeRef = useRef<GainNode>();
  const sourceRef = useRef<MediaStreamAudioSourceNode>();

  useEffect(() => {
    if (!item.isLocal && audioContext && !audioMuted && audioTrackCount > 0) {
      if (!gainNodeRef.current) {
        gainNodeRef.current = new GainNode(audioContext, {
          gain: localVolume,
        });
      }
      if (!sourceRef.current) {
        sourceRef.current = audioContext.createMediaStreamSource(stream);
      }

      const source = sourceRef.current;
      const gainNode = gainNodeRef.current;

      gainNode.gain.value = localVolume;
      source.connect(gainNode).connect(audioDestination);

      return () => {
        source.disconnect();
        gainNode.disconnect();
      };
    }
  }, [
    item,
    audioContext,
    audioDestination,
    stream,
    localVolume,
    audioMuted,
    audioTrackCount,
  ]);

  return null;
}

interface AudioContainerProps {
  items: Participant[];
  audioContext: AudioContext;
  audioDestination: AudioNode;
}

export function AudioContainer({
  items,
  ...rest
}: AudioContainerProps): JSX.Element {
  return (
    <>
      {items
        .filter((item) => !item.isLocal)
        .map((item) => (
          <AudioForParticipant key={item.id} item={item} {...rest} />
        ))}
    </>
  );
}
