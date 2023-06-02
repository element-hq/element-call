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
import { useTranslation } from "react-i18next";

import { ConnectionState } from "../room/useGroupCall";
import { useRoomMemberName } from "./useRoomMemberName";
import { VideoTile } from "./VideoTile";
import { TileDescriptor } from "./TileDescriptor";

interface Props {
  item: TileDescriptor;
  width?: number;
  height?: number;
  getAvatar: (
    roomMember: RoomMember,
    width: number,
    height: number
  ) => JSX.Element;
  maximised: boolean;
}

export function VideoTileContainer({
  item,
  width,
  height,
  getAvatar,
  maximised,
  ...rest
}: Props) {
  const { rawDisplayName } = useRoomMemberName(item.member);
  const { t } = useTranslation();

  let caption: string;
  switch (item.connectionState) {
    case ConnectionState.EstablishingCall:
      caption = t("{{name}} (Connecting...)", { name });
      break;
    case ConnectionState.WaitMedia:
      // not strictly true, but probably easier to understand than, "Waiting for media"
      caption = t("{{name}} (Waiting for video...)", { name });
      break;
    case ConnectionState.Connected:
      caption = rawDisplayName;
      break;
  }

  return (
    <>
      {!item.sfuParticipant && <span title={caption}>{caption}</span>}
      {item.sfuParticipant && (
        <VideoTile
          sfuParticipant={item.sfuParticipant}
          name={rawDisplayName}
          avatar={getAvatar && getAvatar(item.member, width, height)}
          {...rest}
        />
      )}
    </>
  );
}
