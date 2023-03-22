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

import React from "react";

import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { TileDescriptor } from "./TileDescriptor";
import { useCallFeed } from "./useCallFeed";
import { useMediaStream } from "./useMediaStream";

interface Props {
  tileDescriptor: TileDescriptor;
  audioOutput: string;
  otelGroupCallMembership: OTelGroupCallMembership;
}

// Renders and <audio> element on the page playing the given stream
// to the given output.
export const AudioSink: React.FC<Props> = ({
  tileDescriptor,
  audioOutput,
  otelGroupCallMembership,
}: Props) => {
  const { localVolume, stream } = useCallFeed(
    tileDescriptor.callFeed,
    otelGroupCallMembership
  );

  const audioElementRef = useMediaStream(
    stream,
    audioOutput,
    // We don't compare the audioMuted flag of useCallFeed here, since unmuting
    // depends on to-device messages which may lag behind the audio actually
    // starting to flow over the stream
    tileDescriptor.isLocal,
    localVolume
  );

  return <audio ref={audioElementRef} />;
};
