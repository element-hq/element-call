import React, { useCallback, useMemo } from "react";
import styles from "./InCallView.module.css";
import {
  HangupButton,
  MicButton,
  VideoButton,
  ScreenshareButton,
} from "../button";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import VideoGrid, {
  useVideoGridLayout,
} from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoGrid";
import { VideoTileContainer } from "matrix-react-sdk/src/components/views/voip/GroupCallView/VideoTileContainer";
import SimpleVideoGrid from "matrix-react-sdk/src/components/views/voip/GroupCallView/SimpleVideoGrid";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { getAvatarUrl } from "../matrix-utils";
import { GroupCallInspector } from "./GroupCallInspector";
import { OverflowMenu } from "./OverflowMenu";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { Avatar } from "../Avatar";
import { UserMenuContainer } from "../UserMenuContainer";
import { useRageshakeRequestModal } from "../settings/rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";

const canScreenshare = "getDisplayMedia" in navigator.mediaDevices;
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export function InCallView({
  client,
  groupCall,
  roomName,
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
  simpleGrid,
  setShowInspector,
  showInspector,
  roomId,
}) {
  const [layout, setLayout] = useVideoGridLayout(screenshareFeeds.length > 0);

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
          style={{
            width: size,
            height: size,
            borderRadius: size,
            fontSize: Math.round(size / 2),
          }}
          src={avatarUrl && getAvatarUrl(client, avatarUrl, 96)}
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
          <RoomHeaderInfo roomName={roomName} />
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
      ) : simpleGrid ? (
        <SimpleVideoGrid items={items} />
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
        <RageshakeRequestModal {...rageshakeRequestModalProps} />
      )}
    </div>
  );
}
