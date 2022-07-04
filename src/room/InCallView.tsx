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
import { usePreventScroll } from "@react-aria/overlays";
import { GroupCall, MatrixClient } from "matrix-js-sdk";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";

import styles from "./InCallView.module.css";
import {
  HangupButton,
  MicButton,
  VideoButton,
  ScreenshareButton,
} from "../button";
import {
  Header,
  LeftNav,
  RightNav,
  RoomHeaderInfo,
  VersionMismatchWarning,
} from "../Header";
import { VideoGrid, useVideoGridLayout } from "../video-grid/VideoGrid";
import { VideoTileContainer } from "../video-grid/VideoTileContainer";
import { GroupCallInspector } from "./GroupCallInspector";
import { OverflowMenu } from "./OverflowMenu";
import { GridLayoutMenu } from "./GridLayoutMenu";
import { Avatar } from "../Avatar";
import { UserMenuContainer } from "../UserMenuContainer";
import { useRageshakeRequestModal } from "../settings/submit-rageshake";
import { RageshakeRequestModal } from "./RageshakeRequestModal";
import { useMediaHandler } from "../settings/useMediaHandler";
import { useShowInspector } from "../settings/useSetting";
import { useModalTriggerState } from "../Modal";
import { useAudioContext } from "../video-grid/useMediaStream";

const canScreenshare = "getDisplayMedia" in (navigator.mediaDevices ?? {});
// There is currently a bug in Safari our our code with cloning and sending MediaStreams
// or with getUsermedia and getDisplaymedia being used within the same session.
// For now we can disable screensharing in Safari.
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

interface Props {
  client: MatrixClient;
  groupCall: GroupCall;
  roomName: string;
  avatarUrl: string;
  microphoneMuted: boolean;
  localVideoMuted: boolean;
  toggleLocalVideoMuted: () => void;
  toggleMicrophoneMuted: () => void;
  toggleScreensharing: () => void;
  userMediaFeeds: CallFeed[];
  activeSpeaker: string;
  onLeave: () => void;
  isScreensharing: boolean;
  screenshareFeeds: CallFeed[];
  roomId: string;
  unencryptedEventsFromUsers: Set<string>;
}
interface Participant {
  id: string;
  callFeed: CallFeed;
  focused: boolean;
  isLocal: boolean;
  presenter: boolean;
}

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
  roomId,
  unencryptedEventsFromUsers,
}: Props) {
  usePreventScroll();
  const [layout, setLayout] = useVideoGridLayout(screenshareFeeds.length > 0);

  const [audioContext, audioDestination, audioRef] = useAudioContext();
  const { audioOutput } = useMediaHandler();
  const [showInspector] = useShowInspector();

  const { modalState: feedbackModalState, modalProps: feedbackModalProps } =
    useModalTriggerState();

  const items = useMemo(() => {
    const participants: Participant[] = [];

    for (const callFeed of userMediaFeeds) {
      participants.push({
        id: callFeed.stream.id,
        callFeed,
        focused:
          screenshareFeeds.length === 0 && layout === "spotlight"
            ? callFeed.userId === activeSpeaker
            : false,
        isLocal: callFeed.isLocal(),
        presenter: false,
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
        presenter: false,
      });
    }

    return participants;
  }, [userMediaFeeds, activeSpeaker, screenshareFeeds, layout]);

  const renderAvatar = useCallback((roomMember, width, height) => {
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
  }, []);

  const {
    modalState: rageshakeRequestModalState,
    modalProps: rageshakeRequestModalProps,
  } = useRageshakeRequestModal(groupCall.room.roomId);

  return (
    <div className={styles.inRoom}>
      <audio ref={audioRef} />
      <Header>
        <LeftNav>
          <RoomHeaderInfo roomName={roomName} avatarUrl={avatarUrl} />
          <VersionMismatchWarning
            users={unencryptedEventsFromUsers}
            room={groupCall.room}
          />
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
        <VideoGrid items={items} layout={layout} disableAnimations={isSafari}>
          {({ item, ...rest }: { item: Participant; [x: string]: unknown }) => (
            <VideoTileContainer
              key={item.id}
              item={item}
              getAvatar={renderAvatar}
              showName={items.length > 2 || item.focused}
              audioOutputDevice={audioOutput}
              audioContext={audioContext}
              audioDestination={audioDestination}
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
          groupCall={groupCall}
          showInvite={true}
          feedbackModalState={feedbackModalState}
          feedbackModalProps={feedbackModalProps}
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
