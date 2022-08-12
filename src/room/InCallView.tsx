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

import React, { useCallback, useMemo, useRef } from "react";
import { usePreventScroll } from "@react-aria/overlays";
import { GroupCall, MatrixClient, RoomMember } from "matrix-js-sdk";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import classNames from "classnames";

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
import { useShowInspector, useSpatialAudio } from "../settings/useSetting";
import { useModalTriggerState } from "../Modal";
import { useAudioContext } from "../video-grid/useMediaStream";
import { useFullscreen } from "../video-grid/useFullscreen";
import { AudioContainer } from "../video-grid/AudioContainer";
import { useAudioOutputDevice } from "../video-grid/useAudioOutputDevice";

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
  localScreenshareFeed: CallFeed;
  roomIdOrAlias: string;
  unencryptedEventsFromUsers: Set<string>;
}

export interface Participant {
  id: string;
  focused: boolean;
  presenter: boolean;
  callFeed?: CallFeed;
  isLocal?: boolean;
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
  localScreenshareFeed,
  roomIdOrAlias,
  unencryptedEventsFromUsers,
}: Props) {
  usePreventScroll();
  const elementRef = useRef<HTMLDivElement>();
  const { layout, setLayout } = useVideoGridLayout(screenshareFeeds.length > 0);
  const { toggleFullscreen, fullscreenParticipant } = useFullscreen(elementRef);

  const [spatialAudio] = useSpatialAudio();

  const [audioContext, audioDestination, audioRef] = useAudioContext();
  const { audioOutput } = useMediaHandler();
  const [showInspector] = useShowInspector();

  const { modalState: feedbackModalState, modalProps: feedbackModalProps } =
    useModalTriggerState();

  useAudioOutputDevice(audioRef, audioOutput);

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

  const renderAvatar = useCallback(
    (roomMember: RoomMember, width: number, height: number) => {
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
    []
  );

  const renderContent = useCallback((): JSX.Element => {
    if (items.length === 0) {
      return (
        <div className={styles.centerMessage}>
          <p>Waiting for other participants...</p>
        </div>
      );
    }
    if (fullscreenParticipant) {
      return (
        <VideoTileContainer
          key={fullscreenParticipant.id}
          item={fullscreenParticipant}
          getAvatar={renderAvatar}
          audioContext={audioContext}
          audioDestination={audioDestination}
          disableSpeakingIndicator={true}
          isFullscreen={!!fullscreenParticipant}
          onFullscreen={toggleFullscreen}
        />
      );
    }

    return (
      <VideoGrid items={items} layout={layout} disableAnimations={isSafari}>
        {({ item, ...rest }: { item: Participant; [x: string]: unknown }) => (
          <VideoTileContainer
            key={item.id}
            item={item}
            getAvatar={renderAvatar}
            audioOutputDevice={audioOutput}
            audioContext={audioContext}
            audioDestination={audioDestination}
            disableSpeakingIndicator={items.length < 3}
            isFullscreen={!!fullscreenParticipant}
            onFullscreen={toggleFullscreen}
            {...rest}
          />
        )}
      </VideoGrid>
    );
  }, [
    fullscreenParticipant,
    items,
    audioContext,
    audioDestination,
    layout,
    renderAvatar,
    toggleFullscreen,
    audioOutput,
  ]);

  const {
    modalState: rageshakeRequestModalState,
    modalProps: rageshakeRequestModalProps,
  } = useRageshakeRequestModal(groupCall.room.roomId);

  const footerClassNames = classNames(styles.footer, {
    [styles.footerFullscreen]: fullscreenParticipant,
  });

  return (
    <div className={styles.inRoom} ref={elementRef}>
      <audio ref={audioRef} />
      {(!spatialAudio || fullscreenParticipant) && (
        <AudioContainer
          items={items}
          audioContext={audioContext}
          audioDestination={audioDestination}
        />
      )}
      {!fullscreenParticipant && (
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
      )}
      {renderContent()}
      <div className={footerClassNames}>
        <MicButton muted={microphoneMuted} onPress={toggleMicrophoneMuted} />
        <VideoButton muted={localVideoMuted} onPress={toggleLocalVideoMuted} />
        {canScreenshare && !isSafari && !fullscreenParticipant && (
          <ScreenshareButton
            enabled={isScreensharing}
            onPress={toggleScreensharing}
          />
        )}
        {!fullscreenParticipant && (
          <OverflowMenu
            inCall
            roomIdOrAlias={roomIdOrAlias}
            groupCall={groupCall}
            showInvite={true}
            feedbackModalState={feedbackModalState}
            feedbackModalProps={feedbackModalProps}
          />
        )}
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
          roomIdOrAlias={roomIdOrAlias}
        />
      )}
    </div>
  );
}
