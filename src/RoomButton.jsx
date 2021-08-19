import React from "react";
import classNames from "classnames";
import styles from "./RoomButton.module.css";
import { ReactComponent as MicIcon } from "./icons/Mic.svg";
import { ReactComponent as MuteMicIcon } from "./icons/MuteMic.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as DisableVideoIcon } from "./icons/DisableVideo.svg";
import { ReactComponent as HangupIcon } from "./icons/Hangup.svg";
import { ReactComponent as SettingsIcon } from "./icons/Settings.svg";

export function RoomButton({ on, className, children, ...rest }) {
  return (
    <button
      className={classNames(styles.roomButton, className, { [styles.on]: on })}
      {...rest}
    >
      {children}
    </button>
  );
}

export function MicButton({ muted, ...rest }) {
  return (
    <RoomButton {...rest} on={muted}>
      {muted ? <MuteMicIcon /> : <MicIcon />}
    </RoomButton>
  );
}

export function VideoButton({ enabled, ...rest }) {
  return (
    <RoomButton {...rest} on={enabled}>
      {enabled ? <DisableVideoIcon /> : <VideoIcon />}
    </RoomButton>
  );
}

export function HangupButton({ className, ...rest }) {
  return (
    <RoomButton
      className={classNames(styles.hangupButton, className)}
      {...rest}
    >
      <HangupIcon />
    </RoomButton>
  );
}

export function HeaderButton({ on, className, children, ...rest }) {
  return (
    <button
      className={classNames(styles.headerButton, className, {
        [styles.on]: on,
      })}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SettingsButton(props) {
  return (
    <HeaderButton {...props}>
      <SettingsIcon />
    </HeaderButton>
  );
}
