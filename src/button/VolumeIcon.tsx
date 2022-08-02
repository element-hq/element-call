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

import { ReactComponent as AudioMuted } from "../icons/AudioMuted.svg";
import { ReactComponent as AudioLow } from "../icons/AudioLow.svg";
import { ReactComponent as Audio } from "../icons/Audio.svg";

interface Props {
  /**
   * Number between 0 and 1
   */
  volume: number;
}

export function VolumeIcon({ volume }: Props) {
  if (volume <= 0) return <AudioMuted />;
  if (volume <= 0.75) return <AudioLow />;
  return <Audio />;
}
