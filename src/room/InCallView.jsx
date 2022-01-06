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
import SimpleVideoGrid from "matrix-react-sdk/src/components/views/voip/GroupCallView/SimpleVideoGrid";
import "matrix-react-sdk/res/css/views/voip/GroupCallView/_VideoGrid.scss";
import { getAvatarUrl } from "../ConferenceCallManagerHooks";
import { GroupCallInspector } from "../GroupCallInspector";
import { OverflowMenu } from "./OverflowMenu";
import { GridLayoutMenu } from "../GridLayoutMenu";
import { Avatar } from "../Avatar";
import { UserMenuContainer } from "../UserMenuContainer";

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
  const [layout, setLayout] = useVideoGridLayout();

  const items = useMemo(() => {
    const participants = [];

    for (const callFeed of userMediaFeeds) {
      participants.push({
        id: callFeed.stream.id,
        usermediaCallFeed: callFeed,
        isActiveSpeaker:
          screenshareFeeds.length === 0
            ? callFeed.userId === activeSpeaker
            : false,
      });
    }

    for (const callFeed of screenshareFeeds) {
      const participant = participants.find(
        (p) => p.usermediaCallFeed.userId === callFeed.userId
      );

      if (participant) {
        participant.screenshareCallFeed = callFeed;
      }
    }

    return participants;
  }, [userMediaFeeds, activeSpeaker, screenshareFeeds]);

  const onFocusTile = useCallback(
    (tiles, focusedTile) => {
      if (layout === "freedom") {
        return tiles.map((tile) => {
          if (tile === focusedTile) {
            return { ...tile, presenter: !tile.presenter };
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

  return (
    <div className={styles.inRoom}>
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} />
        </LeftNav>
        <RightNav>
          <GridLayoutMenu layout={layout} setLayout={setLayout} />
          <UserMenuContainer disableLogout />
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
          getAvatar={renderAvatar}
          onFocusTile={onFocusTile}
          disableAnimations={isSafari}
        />
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
          roomId={roomId}
          setShowInspector={setShowInspector}
          showInspector={showInspector}
          client={client}
        />
        <HangupButton onPress={onLeave} />
      </div>
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        show={showInspector}
      />
    </div>
  );
}
