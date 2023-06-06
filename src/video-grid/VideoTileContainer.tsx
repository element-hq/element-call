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
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { LocalParticipant, RemoteParticipant } from "livekit-client";

import { useRoomMemberName } from "./useRoomMemberName";
import { TileContent, VideoTile } from "./VideoTile";

export interface ItemData {
  member: RoomMember;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;
}

interface Props {
  item: ItemData;
  width?: number;
  height?: number;
  getAvatar: (
    roomMember: RoomMember,
    width: number,
    height: number
  ) => JSX.Element;
}

export function VideoTileContainer({
  item,
  width,
  height,
  getAvatar,
  ...rest
}: Props) {
  const { rawDisplayName } = useRoomMemberName(item.member);

  return (
    <>
      <VideoTile
        sfuParticipant={item.sfuParticipant}
        content={item.content}
        name={rawDisplayName}
        avatar={getAvatar && getAvatar(item.member, width, height)}
        {...rest}
      />
    </>
  );
}
