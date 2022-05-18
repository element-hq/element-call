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

import React, { useCallback, useMemo } from "react";
import styles from "./InCallView.module.css";
import {
  HangupButton,
  MicButton,
  VideoButton,
  ScreenshareButton,
} from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { VideoGrid, useVideoGridLayout } from "../video-grid/VideoGrid";
import { VideoTileContainer } from "../video-grid/VideoTileContainer";
import { GroupCallInspector } from "./GroupCallInspector";
import { OverflowMenu } from "./OverflowMenu";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { Avatar } from "../Avatar";
import { UserMenuContainer } from "../UserMenuContainer";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { usePreventScroll } from "@react-aria/overlays";
import { useMediaHandler } from "../settings/useMediaHandler";

const canScreenshare = "getDisplayMedia" in navigator.mediaDevices;
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function InCallView({
  client,
  groupCall,
  roomName,
  avatarUrl,
  microphoneMuted,
  localVideoMuted,
  toggleLocalVideoMuted,
  toggleMicrophoneMuted,
  userMediaFeeds,
  activeSpeaker,
  onLeave,
  toggleScreensharing,
  isScreensharing,
  screenshareFeeds,
  setShowInspector,
  showInspector,
  roomId,
}) {
  usePreventScroll();
  const [layout, setLayout] = useVideoGridLayout(screenshareFeeds.length > 0);

  const { audioOutput } = useMediaHandler();

  const items = useMemo(() => {
    const participants = [];

    for (const callFeed of userMediaFeeds) {
      participants.push({
        id: callFeed.stream.id,
        callFeed,
        focused:
          screenshareFeeds.length === 0 && layout === "spotlight"
            ? callFeed.userId === activeSpeaker
            : false,
        isLocal: callFeed.isLocal(),
      });
    }

    for (const callFeed of screenshareFeeds) {
      const userMediaItem = participants.find(
        (item) => item.callFeed.userId === callFeed.userId
      );

      if (userMediaItem) {
        userMediaItem.presenter = true;
      }

      participants.push({
        id: callFeed.stream.id,
        callFeed,
        focused: true,
        isLocal: callFeed.isLocal(),
      });
    }

    return participants;
  }, [userMediaFeeds, activeSpeaker, screenshareFeeds, layout]);

  const onFocusTile = useCallback(
    (tiles, focusedTile) => {
      if (layout === "freedom") {
        return tiles.map((tile) => {
          if (tile === focusedTile) {
            return { ...tile, focused: !tile.focused };
          }

          return tile;
        });
      } else {
        return tiles;
      }
    },
    [layout, setLayout]
  );

  const renderAvatar = useCallback(
    (roomMember, width, height) => {
      const avatarUrl = roomMember.user?.avatarUrl;
      const size = Math.round(Math.min(width, height) / 2);

      return (
        <Avatar
          key={roomMember.userId}
          size={size}
          src={avatarUrl}
          fallback={roomMember.name.slice(0, 1).toUpperCase()}
          className={styles.avatar}
        />
      );
    },
    [client]
  );

  const {
    modalState: rageshakeRequestModalState,
    modalProps: rageshakeRequestModalProps,
  } = useRageshakeRequestModal(groupCall.room.roomId);

  return (
    <div className={styles.inRoom}>
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} avatarUrl={avatarUrl} />
        </LeftNav>
        <RightNav>
          <GridLayoutMenu layout={layout} setLayout={setLayout} />
          <UserMenuContainer preventNavigation />
        </RightNav>
      </Header>
      {items.length === 0 ? (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      ) : (
        <VideoGrid
          items={items}
          layout={layout}
          onFocusTile={onFocusTile}
          disableAnimations={isSafari}
        >
          {({ item, ...rest }) => (
            <VideoTileContainer
              key={item.id}
              item={item}
              getAvatar={renderAvatar}
              showName={items.length > 2 || item.focused}
              audioOutputDevice={audioOutput}
              disableSpeakingIndicator={items.length < 3}
              {...rest}
            />
          )}
        </VideoGrid>
      )}
      <div className={styles.footer}>
        <MicButton muted={microphoneMuted} onPress={toggleMicrophoneMuted} />
        <VideoButton muted={localVideoMuted} onPress={toggleLocalVideoMuted} />
        {canScreenshare && !isSafari && (
          <ScreenshareButton
            enabled={isScreensharing}
            onPress={toggleScreensharing}
          />
        )}
        <OverflowMenu
          inCall
          roomId={roomId}
          setShowInspector={setShowInspector}
          showInspector={showInspector}
          client={client}
          groupCall={groupCall}
        />
        <HangupButton onPress={onLeave} />
      </div>
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        show={showInspector}
      />
      {rageshakeRequestModalState.isOpen && (
        <RageshakeRequestModal
          {...rageshakeRequestModalProps}
          roomId={roomId}
        />
      )}
    </div>
  );
}
