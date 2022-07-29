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
import React, { forwardRef } from "react";
import { PressEvent } from "@react-types/shared";
import classNames from "classnames";
import { useButton } from "@react-aria/button";
import { mergeProps, useObjectRef } from "@react-aria/utils";

import styles from "./Button.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as MuteMicIcon } from "../icons/MuteMic.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as DisableVideoIcon } from "../icons/DisableVideo.svg";
import { ReactComponent as HangupIcon } from "../icons/Hangup.svg";
import { ReactComponent as ScreenshareIcon } from "../icons/Screenshare.svg";
import { ReactComponent as SettingsIcon } from "../icons/Settings.svg";
import { ReactComponent as AddUserIcon } from "../icons/AddUser.svg";
import { ReactComponent as ArrowDownIcon } from "../icons/ArrowDown.svg";
import { TooltipTrigger } from "../Tooltip";
import { ReactComponent as OverflowIcon } from "../icons/Overflow.svg";

export type ButtonVariant =
  | "default"
  | "toolbar"
  | "toolbarSecondary"
  | "icon"
  | "secondary"
  | "copy"
  | "secondaryCopy"
  | "iconCopy"
  | "secondaryHangup"
  | "dropdown"
  | "link";

export const variantToClassName = {
  default: [styles.button],
  toolbar: [styles.toolbarButton],
  toolbarSecondary: [styles.toolbarButtonSecondary],
  icon: [styles.iconButton],
  secondary: [styles.secondary],
  copy: [styles.copyButton],
  secondaryCopy: [styles.secondaryCopy, styles.copyButton],
  iconCopy: [styles.iconCopyButton],
  secondaryHangup: [styles.secondaryHangup],
  dropdown: [styles.dropdownButton],
  link: [styles.linkButton],
};

export type ButtonSize = "lg";

export const sizeToClassName: { lg: string[] } = {
  lg: [styles.lg],
};
interface Props {
  variant: ButtonVariant;
  size: ButtonSize;
  on: () => void;
  off: () => void;
  iconStyle: string;
  className: string;
  children: Element[];
  onPress: (e: PressEvent) => void;
  onPressStart: (e: PressEvent) => void;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}
export const Button = forwardRef<HTMLButtonElement, Props>(
  (
    {
      variant = "default",
      size,
      on,
      off,
      iconStyle,
      className,
      children,
      onPress,
      onPressStart,
      ...rest
    },
    ref
  ) => {
    const buttonRef = useObjectRef<HTMLButtonElement>(ref);
    const { buttonProps } = useButton(
      { onPress, onPressStart, ...rest },
      buttonRef
    );

    // TODO: react-aria's useButton hook prevents form submission via keyboard
    // Remove the hack below after this is merged https://github.com/adobe/react-spectrum/pull/904
    let filteredButtonProps = buttonProps;

    if (rest.type === "submit" && !rest.onPress) {
      const { ...filtered } = buttonProps;
      filteredButtonProps = filtered;
    }

    return (
      <button
        className={classNames(
          variantToClassName[variant],
          sizeToClassName[size],
          styles[iconStyle],
          className,
          {
            [styles.on]: on,
            [styles.off]: off,
          }
        )}
        {...mergeProps(rest, filteredButtonProps)}
        ref={buttonRef}
      >
        <>
          {children}
          {variant === "dropdown" && <ArrowDownIcon />}
        </>
      </button>
    );
  }
);

export function MicButton({
  muted,
  ...rest
}: {
  muted: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} off={muted}>
        {muted ? <MuteMicIcon /> : <MicIcon />}
      </Button>
      {() => (muted ? "Unmute microphone" : "Mute microphone")}
    </TooltipTrigger>
  );
}

export function VideoButton({
  muted,
  ...rest
}: {
  muted: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} off={muted}>
        {muted ? <DisableVideoIcon /> : <VideoIcon />}
      </Button>
      {() => (muted ? "Turn on camera" : "Turn off camera")}
    </TooltipTrigger>
  );
}

export function ScreenshareButton({
  enabled,
  className,
  ...rest
}: {
  enabled: boolean;
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  return (
    <TooltipTrigger>
      <Button variant="toolbarSecondary" {...rest} on={enabled}>
        <ScreenshareIcon />
      </Button>
      {() => (enabled ? "Stop sharing screen" : "Share screen")}
    </TooltipTrigger>
  );
}

export function HangupButton({
  className,
  ...rest
}: {
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  return (
    <TooltipTrigger>
      <Button
        variant="toolbar"
        className={classNames(styles.hangupButton, className)}
        {...rest}
      >
        <HangupIcon />
      </Button>
      {() => "Leave"}
    </TooltipTrigger>
  );
}

export function SettingsButton({
  className,
  ...rest
}: {
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest}>
        <SettingsIcon />
      </Button>
      {() => "Settings"}
    </TooltipTrigger>
  );
}

export function InviteButton({
  className,
  ...rest
}: {
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest}>
        <AddUserIcon />
      </Button>
      {() => "Invite"}
    </TooltipTrigger>
  );
}

export function OptionsButton(props: Omit<Props, "variant">) {
  return (
    <TooltipTrigger>
      <Button variant="icon" {...props}>
        <OverflowIcon />
      </Button>
      {() => "Options"}
    </TooltipTrigger>
  );
}
