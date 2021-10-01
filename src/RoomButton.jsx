import React from "react";
import classNames from "classnames";
import styles from "./RoomButton.module.css";
import { ReactComponent as MicIcon } from "./icons/Mic.svg";
import { ReactComponent as MuteMicIcon } from "./icons/MuteMic.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as DisableVideoIcon } from "./icons/DisableVideo.svg";
import { ReactComponent as HangupIcon } from "./icons/Hangup.svg";
import { ReactComponent as SettingsIcon } from "./icons/Settings.svg";
import { ReactComponent as GridIcon } from "./icons/Grid.svg";
import { ReactComponent as SpeakerIcon } from "./icons/Speaker.svg";
import { ReactComponent as ScreenshareIcon } from "./icons/Screenshare.svg";

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

export function ScreenshareButton({ enabled, className, ...rest }) {
  return (
    <RoomButton
      className={classNames(styles.screenshareButton, className)}
      {...rest}
      on={enabled}
    >
      <ScreenshareIcon />
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

export function LayoutToggleButton({ layout, ...rest }) {
  return (
    <HeaderButton {...rest}>
      {layout === "spotlight" ? (
        <SpeakerIcon width={20} height={20} />
      ) : (
        <GridIcon width={20} height={20} />
      )}
    </HeaderButton>
  );
}
