/*
Copyright 2022 - 2023 New Vector Ltd

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

import React, { useEffect, useMemo } from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";
import i18n from "i18next";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { CallFeed } from "matrix-js-sdk/src/webrtc/callFeed";
import { useTranslation } from "react-i18next";

import { useDelayedState } from "../useDelayedState";
import { useModalTriggerState } from "../Modal";
import { InviteModal } from "./InviteModal";
import { HangupButton, InviteButton, SettingsButton } from "../button";
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
import { Size } from "../Avatar";
import { ParticipantInfo } from "./useGroupCall";
import { OTelGroupCallMembership } from "../otel/OTelGroupCallMembership";
import { SettingsModal } from "../settings/SettingsModal";

function getPromptText(
  networkWaiting: boolean,
  showTalkOverError: boolean,
  pttButtonHeld: boolean,
  activeSpeakerIsLocalUser: boolean,
  talkOverEnabled: boolean,
  activeSpeakerUserId: string,
  activeSpeakerDisplayName: string,
  connected: boolean,
  t: typeof i18n.t
): string {
  if (!connected) return t("Connection lost");

  const isTouchScreen = Boolean(window.ontouchstart !== undefined);

  if (networkWaiting) {
    return t("Waiting for network");
  }

  if (showTalkOverError) {
    return t("You can't talk at the same time");
  }

  if (pttButtonHeld && activeSpeakerIsLocalUser) {
    if (isTouchScreen) {
      return t("Release to stop");
    } else {
      return t("Release spacebar key to stop");
    }
  }

  if (talkOverEnabled && activeSpeakerUserId && !activeSpeakerIsLocalUser) {
    if (isTouchScreen) {
      return t("Press and hold to talk over {{name}}", {
        name: activeSpeakerDisplayName,
      });
    } else {
      return t("Press and hold spacebar to talk over {{name}}", {
        name: activeSpeakerDisplayName,
      });
    }
  }

  if (isTouchScreen) {
    return t("Press and hold to talk");
  } else {
    return t("Press and hold spacebar to talk");
  }
}

interface Props {
  client: MatrixClient;
  roomIdOrAlias: string;
  roomName: string;
  avatarUrl: string;
  groupCall: GroupCall;
  participants: Map<RoomMember, Map<string, ParticipantInfo>>;
  userMediaFeeds: CallFeed[];
  onLeave: () => void;
  isEmbedded: boolean;
  hideHeader: boolean;
  otelGroupCallMembership: OTelGroupCallMembership;
}

export const PTTCallView: React.FC<Props> = ({
  client,
  roomIdOrAlias,
  roomName,
  avatarUrl,
  groupCall,
  participants,
  userMediaFeeds,
  onLeave,
  isEmbedded,
  hideHeader,
  otelGroupCallMembership,
}) => {
  const { t } = useTranslation();
  const { modalState: inviteModalState, modalProps: inviteModalProps } =
    useModalTriggerState();
  const { modalState: settingsModalState, modalProps: settingsModalProps } =
    useModalTriggerState();

  const [containerRef, bounds] = useMeasure({ polyfill: ResizeObserver });
  const facepileSize = bounds.width < 800 ? Size.SM : Size.MD;
  const showControls = bounds.height > 500;
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

  const participatingMembers = useMemo(() => {
    const members: RoomMember[] = [];
    for (const [member, deviceMap] of participants) {
      // Repeat the member for as many devices as they're using
      for (let i = 0; i < deviceMap.size; i++) members.push(member);
    }
    return members;
  }, [participants]);

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
        otelGroupCallMembership={otelGroupCallMembership}
        // Never shown in PTT mode, but must be present to collect call state
        // https://github.com/vector-im/element-call/issues/328
        show={false}
      />
      {!hideHeader && showControls && (
        <Header className={styles.header}>
          <LeftNav>
            <RoomSetupHeaderInfo
              roomName={roomName}
              avatarUrl={avatarUrl}
              onPress={onLeave}
              isEmbedded={isEmbedded}
            />
          </LeftNav>
          <RightNav />
        </Header>
      )}
      <div className={styles.center}>
        {/* Always render this because the window will become shorter when the on-screen
            keyboard appears, so if we don't render it, the dialog will unmount. */}
        <div style={{ display: showControls ? "block" : "none" }}>
          <div className={styles.participants}>
            <p>
              {t("{{count}} people connected", {
                count: participatingMembers.length,
              })}
            </p>
            <Facepile
              size={facepileSize}
              max={8}
              className={styles.facepile}
              client={client}
              members={participatingMembers}
            />
          </div>
          <div className={styles.footer}>
            <SettingsButton onPress={() => settingsModalState.open()} />
            {!isEmbedded && <HangupButton onPress={onLeave} />}
            <InviteButton onPress={() => inviteModalState.open()} />
          </div>
        </div>

        <div className={styles.pttButtonContainer}>
          {showControls &&
            (activeSpeakerUserId ? (
              <div className={styles.talkingInfo}>
                <h2>
                  {!activeSpeakerIsLocalUser && (
                    <AudioIcon className={styles.speakerIcon} />
                  )}
                  {activeSpeakerIsLocalUser
                    ? t("Talking…")
                    : t("{{name}} is talking…", {
                        name: activeSpeakerDisplayName,
                      })}
                </h2>
                <Timer value={activeSpeakerUserId} />
              </div>
            ) : (
              <div className={styles.talkingInfo} />
            ))}
          <PTTButton
            enabled={!inviteModalState.isOpen && !settingsModalState.isOpen}
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
          {showControls && (
            <p className={styles.actionTip}>
              {getPromptText(
                networkWaiting,
                showTalkOverError,
                pttButtonHeld,
                activeSpeakerIsLocalUser,
                talkOverEnabled,
                activeSpeakerUserId,
                activeSpeakerDisplayName,
                connected,
                t
              )}
            </p>
          )}
          {userMediaFeeds.map((callFeed) => (
            <PTTFeed
              key={callFeed.userId}
              callFeed={callFeed}
              audioOutputDevice={audioOutput}
            />
          ))}
          {isAdmin && showControls && (
            <Toggle
              isSelected={talkOverEnabled}
              onChange={setTalkOverEnabled}
              label={t("Talk over speaker")}
              id="talkOverEnabled"
            />
          )}
        </div>
      </div>

      {settingsModalState.isOpen && (
        <SettingsModal
          client={client}
          roomId={groupCall.room.roomId}
          {...settingsModalProps}
        />
      )}
      {inviteModalState.isOpen && showControls && (
        <InviteModal roomIdOrAlias={roomIdOrAlias} {...inviteModalProps} />
      )}
    </div>
  );
};
