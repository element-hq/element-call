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

import React, { FC, useEffect, useRef } from "react";

import { TileDescriptor } from "../room/InCallView";
import { useCallFeed } from "./useCallFeed";
import { useMediaStreamTrackCount } from "./useMediaStream";

// XXX: These in fact do not render anything but to my knowledge this is the
// only way to a hook on an array

interface AudioForParticipantProps {
  item: TileDescriptor;
  audioContext: AudioContext;
  audioDestination: AudioNode;
}

export const AudioForParticipant: FC<AudioForParticipantProps> = ({
  item,
  audioContext,
  audioDestination,
}) => {
  const { stream, localVolume } = useCallFeed(item.callFeed);
  const [audioTrackCount] = useMediaStreamTrackCount(stream);

  const gainNodeRef = useRef<GainNode>();
  const sourceRef = useRef<MediaStreamAudioSourceNode>();

  useEffect(() => {
    // We don't compare the audioMuted flag of useCallFeed here, since unmuting
    // depends on to-device messages which may lag behind the audio actually
    // starting to flow over the network
    if (!item.isLocal && audioContext && audioTrackCount > 0) {
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
    audioTrackCount,
  ]);

  return null;
};

interface AudioContainerProps {
  items: TileDescriptor[];
  audioContext: AudioContext;
  audioDestination: AudioNode;
}

export const AudioContainer: FC<AudioContainerProps> = ({ items, ...rest }) => {
  return (
    <>
      {items
        .filter((item) => !item.isLocal)
        .map((item) => (
          <AudioForParticipant key={item.id} item={item} {...rest} />
        ))}
    </>
  );
};
