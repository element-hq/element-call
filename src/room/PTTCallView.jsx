import React from "react";
import { useModalTriggerState } from "../Modal";
import { SettingsModal } from "../settings/SettingsModal";
import { InviteModal } from "./InviteModal";
import { Button, HangupButton, InviteButton, SettingsButton } from "../button";
import { Header, LeftNav, RightNav, RoomSetupHeaderInfo } from "../Header";
import { ReactComponent as AddUserIcon } from "../icons/AddUser.svg";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import styles from "./PTTCallView.module.css";
import { Facepile } from "../Facepile";
import { PTTButton } from "./PTTButton";
import { PTTFeed } from "./PTTFeed";
import { useMediaHandler } from "../settings/useMediaHandler";
import useMeasure from "react-use-measure";
import { ResizeObserver } from "@juggle/resize-observer";

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
  const [containerRef, bounds] = useMeasure({ polyfill: ResizeObserver });
  const facepileSize = bounds.width < 800 ? "sm" : "md";

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
          <div className={styles.talkingInfo}>
            <h2>Talking...</h2>
            <p>00:01:24</p>
          </div>
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
