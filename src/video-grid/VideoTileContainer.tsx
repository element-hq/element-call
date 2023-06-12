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
import {
  RoomMember,
  RoomMemberEvent,
} from "matrix-js-sdk/src/models/room-member";
import { LocalParticipant, RemoteParticipant } from "livekit-client";

import { TileContent, VideoTile } from "./VideoTile";
import { Avatar } from "../Avatar";
import Styles from "../room/InCallView.module.css";

export interface ItemData {
  member?: RoomMember;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;
}

interface Props {
  item: ItemData;
  width?: number;
  height?: number;
}

export function VideoTileContainer({ item, width, height, ...rest }: Props) {
  const [displayName, setDisplayName] = React.useState<string>("[👻]");

  React.useEffect(() => {
    const member = item.member;

    if (member) {
      setDisplayName(member.rawDisplayName);

      const updateName = () => {
        setDisplayName(member.rawDisplayName);
      };

      member!.on(RoomMemberEvent.Name, updateName);
      return () => {
        member!.removeListener(RoomMemberEvent.Name, updateName);
      };
    }
  }, [item.member]);

  const avatar = (
    <Avatar
      key={item.member?.userId}
      size={Math.round(Math.min(width ?? 0, height ?? 0) / 2)}
      src={item.member?.getMxcAvatarUrl()}
      fallback={displayName.slice(0, 1).toUpperCase()}
      className={Styles.avatar}
    />
  );

  return (
    <>
      <VideoTile
        sfuParticipant={item.sfuParticipant}
        content={item.content}
        name={displayName}
        avatar={avatar}
        {...rest}
      />
    </>
  );
}
