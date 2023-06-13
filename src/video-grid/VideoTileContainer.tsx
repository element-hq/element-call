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
import { SpringValue } from "@react-spring/web";
import { EventTypes, Handler, useDrag } from "@use-gesture/react";

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

  // TODO: Refactor this set of props.
  // See https://github.com/vector-im/element-call/pull/1099#discussion_r1226863404
  id: string;
  targetWidth: number;
  targetHeight: number;
  opacity?: SpringValue<number>;
  scale?: SpringValue<number>;
  shadow?: SpringValue<number>;
  shadowSpread?: SpringValue<number>;
  zIndex?: SpringValue<number>;
  x?: SpringValue<number>;
  y?: SpringValue<number>;
  width?: SpringValue<number>;
  height?: SpringValue<number>;
  onDragRef?: React.RefObject<
    (
      tileId: string,
      state: Parameters<Handler<"drag", EventTypes["drag"]>>[0]
    ) => void
  >;
}

export const VideoTileContainer: React.FC<Props> = React.memo(
  ({ item, id, targetWidth, targetHeight, onDragRef, ...rest }) => {
    // Handle display name changes.
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

    // Create an avatar.
    const avatar = (
      <Avatar
        key={item.member?.userId}
        size={Math.round(Math.min(targetWidth, targetHeight) / 2)}
        src={item.member?.getMxcAvatarUrl()}
        fallback={displayName.slice(0, 1).toUpperCase()}
        className={Styles.avatar}
      />
    );

    // Make sure that the tile is draggable and work well within video grid layout.
    //
    // Firefox doesn't respect the disablePictureInPicture attribute
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831
    const tileRef = React.useRef<HTMLElement | null>(null);
    useDrag((state) => onDragRef?.current!(id, state), {
      target: tileRef,
      filterTaps: true,
      preventScroll: true,
    });

    return (
      <VideoTile
        ref={tileRef}
        sfuParticipant={item.sfuParticipant}
        content={item.content}
        name={displayName}
        avatar={avatar}
        {...rest}
      />
    );
  }
);
