import React from "react";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { InviteModal } from "./InviteModal";
import { Button } from "../button";
import { Header, LeftNav, RightNav, RoomSetupHeaderInfo } from "../Header";
import { ReactComponent as AddUserIcon } from "../icons/AddUser.svg";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import styles from "./PTTCallView.module.css";
import { Facepile } from "../Facepile";
import { PTTButton } from "./PTTButton";
import { PTTFeed } from "./PTTFeed";
import { useMediaHandler } from "../settings/useMediaHandler";

export function PTTCallView({
  groupCall,
  participants,
  client,
  roomName,
  microphoneMuted,
  toggleMicrophoneMuted,
  userMediaFeeds,
  activeSpeaker,
  onLeave,
  setShowInspector,
  showInspector,
  roomId,
}) {
  const { modalState: inviteModalState, modalProps: inviteModalProps } =
    useModalTriggerState();
  const { modalState: settingsModalState, modalProps: settingsModalProps } =
    useModalTriggerState();
  const { audioOutput } = useMediaHandler();

  return (
    <div className={styles.pttCallView}>
      <Header className={styles.header}>
        <LeftNav>
          <RoomSetupHeaderInfo roomName={roomName} onPress={onLeave} />
        </LeftNav>
        <RightNav>
          <Button variant="secondaryHangup" onPress={onLeave}>
            Leave
          </Button>
          <Button variant="icon" onPress={() => inviteModalState.open()}>
            <AddUserIcon />
          </Button>
          <Button variant="icon" onPress={() => settingsModalState.open()}>
            <SettingsIcon />
          </Button>
        </RightNav>
      </Header>
      <div className={styles.headerSeparator} />
      <div className={styles.participants}>
        <p>{`${participants.length} user${
          participants.length > 1 ? "s" : ""
        } connected`}</p>
        <Facepile client={client} participants={participants} />
      </div>
      <div className={styles.center}>
        <PTTButton
          client={client}
          activeSpeaker={activeSpeaker}
          groupCall={groupCall}
        />
        <p className={styles.actionTip}>Press and hold spacebar to talk</p>
        {userMediaFeeds.map((callFeed) => (
          <PTTFeed
            key={callFeed.userId}
            callFeed={callFeed}
            audioOutputDevice={audioOutput}
          />
        ))}
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
