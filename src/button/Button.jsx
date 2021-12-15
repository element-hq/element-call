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
import { Tooltip, TooltipTrigger } from "../Tooltip";

export const variantToClassName = {
  default: [styles.button],
  toolbar: [styles.toolbarButton],
  icon: [styles.iconButton],
  secondary: [styles.secondary],
  copy: [styles.copyButton],
  iconCopy: [styles.iconCopyButton],
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
      ...rest
    },
    ref
  ) => {
    const buttonRef = useObjectRef(ref);
    const { buttonProps } = useButton(rest, buttonRef);

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
          }
        )}
        {...mergeProps(filteredButtonProps, rest)}
        ref={buttonRef}
      >
        {children}
      </button>
    );
  }
);

export function ButtonTooltip({ className, children }) {
  return (
    <div className={classNames(styles.buttonTooltip, className)}>
      {children}
    </div>
  );
}

export function MicButton({ muted, ...rest }) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} off={muted}>
        {muted ? <MuteMicIcon /> : <MicIcon />}
      </Button>
      {(props) => (
        <Tooltip position="top" {...props}>
          {muted ? "Unmute microphone" : "Mute microphone"}
        </Tooltip>
      )}
    </TooltipTrigger>
  );
}

export function VideoButton({ muted, ...rest }) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} off={muted}>
        {muted ? <DisableVideoIcon /> : <VideoIcon />}
      </Button>
      {(props) => (
        <Tooltip position="top" {...props}>
          {muted ? "Turn on camera" : "Turn off camera"}
        </Tooltip>
      )}
    </TooltipTrigger>
  );
}

export function ScreenshareButton({ enabled, className, ...rest }) {
  return (
    <TooltipTrigger>
      <Button variant="toolbar" {...rest} on={enabled}>
        <ScreenshareIcon />
      </Button>
      {(props) => (
        <Tooltip position="top" {...props}>
          {enabled ? "Stop sharing screen" : "Share screen"}
        </Tooltip>
      )}
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
      {(props) => (
        <Tooltip position="top" {...props}>
          Leave
        </Tooltip>
      )}
    </TooltipTrigger>
  );
}
