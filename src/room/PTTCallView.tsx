import React from "react";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";

import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
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
import { getAvatarUrl } from "../matrix-utils";
import { ReactComponent as AudioIcon } from "../icons/Audio.svg";

export function PTTCallView({
  client,
  roomId,
  roomName,
  groupCall,
  participants,
  userMediaFeeds,
  onLeave,
  setShowInspector,
  showInspector,
}) {
  const { modalState: inviteModalState, modalProps: inviteModalProps } =
    useModalTriggerState();
  const { modalState: settingsModalState, modalProps: settingsModalProps } =
    useModalTriggerState();
  const [containerRef, bounds] = useMeasure({ polyfill: ResizeObserver });
  const facepileSize = bounds.width < 800 ? "sm" : "md";
  const pttButtonSize = 232;
  const pttBorderWidth = 6;

  const { audioOutput } = useMediaHandler();

  const {
    pttButtonHeld,
    isAdmin,
    talkOverEnabled,
    setTalkOverEnabled,
    activeSpeakerUserId,
    startTalking,
    stopTalking,
  } = usePTT(client, groupCall, userMediaFeeds);

  const activeSpeakerIsLocalUser =
    activeSpeakerUserId && client.getUserId() === activeSpeakerUserId;
  const showTalkOverError =
    pttButtonHeld && !activeSpeakerIsLocalUser && !talkOverEnabled;
  const activeSpeakerUser = activeSpeakerUserId
    ? client.getUser(activeSpeakerUserId)
    : null;
  const activeSpeakerAvatarUrl = activeSpeakerUser
    ? getAvatarUrl(
        client,
        activeSpeakerUser.avatarUrl,
        pttButtonSize - pttBorderWidth * 2
      )
    : null;
  const activeSpeakerDisplayName = activeSpeakerUser
    ? activeSpeakerUser.displayName
    : "";

  return (
    <div className={styles.pttCallView} ref={containerRef}>
      <Header className={styles.header}>
        <LeftNav>
          <RoomSetupHeaderInfo roomName={roomName} onPress={onLeave} />
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
          <SettingsButton onPress={() => settingsModalState.open()} />
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
            showTalkOverError={showTalkOverError}
            activeSpeakerUserId={activeSpeakerUserId}
            activeSpeakerDisplayName={activeSpeakerDisplayName}
            activeSpeakerAvatarUrl={activeSpeakerAvatarUrl}
            activeSpeakerIsLocalUser={activeSpeakerIsLocalUser}
            size={pttButtonSize}
            startTalking={startTalking}
            stopTalking={stopTalking}
          />
          <p className={styles.actionTip}>
            {showTalkOverError
              ? "You can't talk at the same time"
              : pttButtonHeld
              ? "Release spacebar key to stop"
              : talkOverEnabled &&
                activeSpeakerUserId &&
                !activeSpeakerIsLocalUser
              ? `Press and hold spacebar to talk over ${activeSpeakerDisplayName}`
              : "Press and hold spacebar to talk"}
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

      {settingsModalState.isOpen && (
        <SettingsModal
          {...settingsModalProps}
          setShowInspector={setShowInspector}
          showInspector={showInspector}
        />
      )}
      {inviteModalState.isOpen && (
        <InviteModal roomId={roomId} {...inviteModalProps} />
      )}
    </div>
  );
}
