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

import { LocalParticipant, RemoteParticipant } from "livekit-client";
import React, { FC, memo, RefObject, useRef } from "react";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { SpringValue } from "@react-spring/web";
import { EventTypes, Handler, useDrag } from "@use-gesture/react";

import { useRoomMemberName } from "./useRoomMemberName";
import { TileContent, VideoTile } from "./VideoTile";

export interface ItemData {
  id: string;
  member: RoomMember;
  sfuParticipant: LocalParticipant | RemoteParticipant;
  content: TileContent;
}

interface Props {
  item: ItemData;
  targetWidth: number;
  targetHeight: number;
  getAvatar: (
    roomMember: RoomMember,
    width: number,
    height: number
  ) => JSX.Element;
  disableSpeakingIndicator: boolean;
  maximised: boolean;
  opacity?: SpringValue<number>;
  scale?: SpringValue<number>;
  shadow?: SpringValue<number>;
  shadowSpread?: SpringValue<number>;
  zIndex?: SpringValue<number>;
  x?: SpringValue<number>;
  y?: SpringValue<number>;
  width?: SpringValue<number>;
  height?: SpringValue<number>;
  onDragRef?: RefObject<
    (
      tileId: string,
      state: Parameters<Handler<"drag", EventTypes["drag"]>>[0]
    ) => void
  >;
}

export const VideoTileContainer: FC<Props> = memo(
  ({
    item,
    targetWidth,
    targetHeight,
    getAvatar,
    onDragRef,
    ...rest
  }) => {
    const { rawDisplayName } = useRoomMemberName(item.member);
    const tileRef = useRef<HTMLElement | null>(null);

    useDrag((state) => onDragRef?.current!(item.id, state), {
      target: tileRef,
      filterTaps: true,
      preventScroll: true,
    });

    // Firefox doesn't respect the disablePictureInPicture attribute
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1611831

    return (
      <VideoTile
        ref={tileRef}
        sfuParticipant={item.sfuParticipant}
        content={item.content}
        name={rawDisplayName}
        avatar={getAvatar && getAvatar(item.member, targetWidth, targetHeight)}
        {...rest}
      />
    );
  }
);
