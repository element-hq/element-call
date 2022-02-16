import React, { forwardRef } from "react";
import classNames from "classnames";
import styles from "./Button.module.css";
import { ReactComponent as MicIcon } from "../icons/Mic.svg";
import { ReactComponent as MuteMicIcon } from "../icons/MuteMic.svg";
import { ReactComponent as VideoIcon } from "../icons/Video.svg";
import { ReactComponent as DisableVideoIcon } from "../icons/DisableVideo.svg";
import { ReactComponent as HangupIcon } from "../icons/Hangup.svg";
import { ReactComponent as ScreenshareIcon } from "../icons/Screenshare.svg";
import { useButton } from "@react-aria/button";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import { TooltipTrigger } from "../Tooltip";

export const variantToClassName = {
  default: [styles.button],
  toolbar: [styles.toolbarButton],
  toolbarSecondary: [styles.toolbarButtonSecondary],
  icon: [styles.iconButton],
  secondary: [styles.secondary],
  copy: [styles.copyButton],
  iconCopy: [styles.iconCopyButton],
  secondaryCopy: [styles.copyButton],
};

export const sizeToClassName = {
  lg: [styles.lg],
};

export const Button = forwardRef(
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
    const buttonRef = useObjectRef(ref);
    const { buttonProps } = useButton(
      { onPress, onPressStart, ...rest },
      buttonRef
    );

    // TODO: react-aria's useButton hook prevents form submission via keyboard
    // Remove the hack below after this is merged https://github.com/adobe/react-spectrum/pull/904
    let filteredButtonProps = buttonProps;

    if (rest.type === "submit" && !rest.onPress) {
      const { onKeyDown, onKeyUp, ...filtered } = buttonProps;
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
            [styles.secondaryCopy]: variant === "secondaryCopy",
          }
        )}
        {...mergeProps(rest, filteredButtonProps)}
        ref={buttonRef}
      >
        {children}
      </button>
    );
  }
);

export function MicButton({ muted, ...rest }) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} off={muted} id="microphoneButton">
        {muted ? <MuteMicIcon /> : <MicIcon />}
      </Button>
      {() => (muted ? "Unmute microphone" : "Mute microphone")}
    </TooltipTrigger>
  );
}

export function VideoButton({ muted, ...rest }) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} off={muted} id="cameraButton">
        {muted ? <DisableVideoIcon /> : <VideoIcon />}
      </Button>
      {() => (muted ? "Turn on camera" : "Turn off camera")}
    </TooltipTrigger>
  );
}

export function ScreenshareButton({ enabled, className, ...rest }) {
  return (
    <TooltipTrigger>
      <Button variant="toolbarSecondary" {...rest} on={enabled}>
        <ScreenshareIcon />
      </Button>
      {() => (enabled ? "Stop sharing screen" : "Share screen")}
    </TooltipTrigger>
  );
}

export function HangupButton({ className, ...rest }) {
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
