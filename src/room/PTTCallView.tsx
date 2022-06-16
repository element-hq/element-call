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

import React, { useEffect } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import { GroupCall, MatrixClient, RoomMember } from "matrix-js-sdk";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";

import { useDelayedState } from "../useDelayedState";
import { useModalTriggerState } from "../Modal";
import { InviteModal } from "./InviteModal";
import { HangupButton, InviteButton } from "../button";
import { Header, LeftNav, RightNav, RoomSetupHeaderInfo } from "../Header";
import styles from "./PTTCallView.module.css";
import { Facepile } from "../Facepile";
import { PTTButton } from "./PTTButton";
import { PTTFeed } from "./PTTFeed";
import { useMediaHandler } from "../settings/useMediaHandler";
import { usePTT } from "./usePTT";
import { Timer } from "./Timer";
import { Toggle } from "../input/Toggle";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";
import { usePTTSounds } from "../sound/usePttSounds";
import { PTTClips } from "../sound/PTTClips";
import { GroupCallInspector } from "./GroupCallInspector";
import { OverflowMenu } from "./OverflowMenu";

function getPromptText(
  networkWaiting: boolean,
  showTalkOverError: boolean,
  pttButtonHeld: boolean,
  activeSpeakerIsLocalUser: boolean,
  talkOverEnabled: boolean,
  activeSpeakerUserId: string,
  activeSpeakerDisplayName: string,
  connected: boolean
): string {
  if (!connected) return "Connection lost";

  const isTouchScreen = Boolean(window.ontouchstart !== undefined);

  if (networkWaiting) {
    return "Waiting for network";
  }

  if (showTalkOverError) {
    return "You can't talk at the same time";
  }

  if (pttButtonHeld && activeSpeakerIsLocalUser) {
    if (isTouchScreen) {
      return "Release to stop";
    } else {
      return "Release spacebar key to stop";
    }
  }

  if (talkOverEnabled && activeSpeakerUserId && !activeSpeakerIsLocalUser) {
    if (isTouchScreen) {
      return `Press and hold to talk over ${activeSpeakerDisplayName}`;
    } else {
      return `Press and hold spacebar to talk over ${activeSpeakerDisplayName}`;
    }
  }

  if (isTouchScreen) {
    return "Press and hold to talk";
  } else {
    return "Press and hold spacebar to talk";
  }
}

interface Props {
  client: MatrixClient;
  roomId: string;
  roomName: string;
  avatarUrl: string;
  groupCall: GroupCall;
  participants: RoomMember[];
  userMediaFeeds: CallFeed[];
  onLeave: () => void;
}

export const PTTCallView: React.FC<Props> = ({
  client,
  roomId,
  roomName,
  avatarUrl,
  groupCall,
  participants,
  userMediaFeeds,
  onLeave,
}) => {
  const { modalState: inviteModalState, modalProps: inviteModalProps } =
    useModalTriggerState();
  const { modalState: feedbackModalState, modalProps: feedbackModalProps } =
    useModalTriggerState();
  const [containerRef, bounds] = useMeasure({ polyfill: ResizeObserver });
  const facepileSize = bounds.width < 800 ? "sm" : "md";
  const pttButtonSize = 232;

  const { audioOutput } = useMediaHandler();

  const {
    startTalkingLocalRef,
    startTalkingRemoteRef,
    blockedRef,
    endTalkingRef,
    playClip,
  } = usePTTSounds();

  const {
    pttButtonHeld,
    isAdmin,
    talkOverEnabled,
    setTalkOverEnabled,
    activeSpeakerUserId,
    activeSpeakerVolume,
    startTalking,
    stopTalking,
    transmitBlocked,
    connected,
  } = usePTT(client, groupCall, userMediaFeeds, playClip);

  const [talkingExpected, enqueueTalkingExpected, setTalkingExpected] =
    useDelayedState(false);
  const showTalkOverError = pttButtonHeld && transmitBlocked;
  const networkWaiting =
    talkingExpected && !activeSpeakerUserId && !showTalkOverError;

  const activeSpeakerIsLocalUser = activeSpeakerUserId === client.getUserId();
  const activeSpeakerUser = activeSpeakerUserId
    ? client.getUser(activeSpeakerUserId)
    : null;
  const activeSpeakerAvatarUrl = activeSpeakerUser?.avatarUrl;
  const activeSpeakerDisplayName = activeSpeakerUser
    ? activeSpeakerUser.displayName
    : "";

  useEffect(() => {
    setTalkingExpected(activeSpeakerIsLocalUser);
  }, [activeSpeakerIsLocalUser, setTalkingExpected]);

  return (
    <div className={styles.pttCallView} ref={containerRef}>
      <PTTClips
        startTalkingLocalRef={startTalkingLocalRef}
        startTalkingRemoteRef={startTalkingRemoteRef}
        endTalkingRef={endTalkingRef}
        blockedRef={blockedRef}
      />
      <GroupCallInspector
        client={client}
        groupCall={groupCall}
        // Never shown in PTT mode, but must be present to collect call state
        // https://github.com/vector-im/element-call/issues/328
        show={false}
      />
      <Header className={styles.header}>
        <LeftNav>
          <RoomSetupHeaderInfo
            roomName={roomName}
            avatarUrl={avatarUrl}
            onPress={onLeave}
          />
        </LeftNav>
        <RightNav />
      </Header>
      <div className={styles.center}>
        <div className={styles.participants}>
          <p>{`${participants.length} ${
            participants.length > 1 ? "people" : "person"
          } connected`}</p>
          <Facepile
            size={facepileSize}
            max={8}
            className={styles.facepile}
            client={client}
            participants={participants}
          />
        </div>
        <div className={styles.footer}>
          <OverflowMenu
            inCall
            roomId={roomId}
            client={client}
            groupCall={groupCall}
            showInvite={false}
            feedbackModalState={feedbackModalState}
            feedbackModalProps={feedbackModalProps}
          />
          <HangupButton onPress={onLeave} />
          <InviteButton onPress={() => inviteModalState.open()} />
        </div>

        <div className={styles.pttButtonContainer}>
          {activeSpeakerUserId ? (
            <div className={styles.talkingInfo}>
              <h2>
                {!activeSpeakerIsLocalUser && (
                  <AudioIcon className={styles.speakerIcon} />
                )}
                {activeSpeakerIsLocalUser
                  ? "Talking..."
                  : `${activeSpeakerDisplayName} is talking...`}
              </h2>
              <Timer value={activeSpeakerUserId} />
            </div>
          ) : (
            <div className={styles.talkingInfo} />
          )}
          <PTTButton
            enabled={!feedbackModalState.isOpen}
            showTalkOverError={showTalkOverError}
            activeSpeakerUserId={activeSpeakerUserId}
            activeSpeakerDisplayName={activeSpeakerDisplayName}
            activeSpeakerAvatarUrl={activeSpeakerAvatarUrl}
            activeSpeakerIsLocalUser={activeSpeakerIsLocalUser}
            activeSpeakerVolume={activeSpeakerVolume}
            size={pttButtonSize}
            startTalking={startTalking}
            stopTalking={stopTalking}
            networkWaiting={networkWaiting}
            enqueueNetworkWaiting={enqueueTalkingExpected}
            setNetworkWaiting={setTalkingExpected}
          />
          <p className={styles.actionTip}>
            {getPromptText(
              networkWaiting,
              showTalkOverError,
              pttButtonHeld,
              activeSpeakerIsLocalUser,
              talkOverEnabled,
              activeSpeakerUserId,
              activeSpeakerDisplayName,
              connected
            )}
          </p>
          {userMediaFeeds.map((callFeed) => (
            <PTTFeed
              key={callFeed.userId}
              callFeed={callFeed}
              audioOutputDevice={audioOutput}
            />
          ))}
          {isAdmin && (
            <Toggle
              isSelected={talkOverEnabled}
              onChange={setTalkOverEnabled}
              label="Talk over speaker"
              id="talkOverEnabled"
            />
          )}
        </div>
      </div>

      {inviteModalState.isOpen && (
        <InviteModal roomId={roomId} {...inviteModalProps} />
      )}
    </div>
  );
};
