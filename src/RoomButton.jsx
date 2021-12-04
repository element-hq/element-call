import React, { useRef, useState, useEffect, forwardRef } from "react";
import classNames from "classnames";
import styles from "./RoomButton.module.css";
import { ReactComponent as MicIcon } from "./icons/Mic.svg";
import { ReactComponent as MuteMicIcon } from "./icons/MuteMic.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as DisableVideoIcon } from "./icons/DisableVideo.svg";
import { ReactComponent as HangupIcon } from "./icons/Hangup.svg";
import { ReactComponent as SettingsIcon } from "./icons/Settings.svg";
import { ReactComponent as FreedomIcon } from "./icons/Freedom.svg";
import { ReactComponent as SpotlightIcon } from "./icons/Spotlight.svg";
import { ReactComponent as ScreenshareIcon } from "./icons/Screenshare.svg";
import { ReactComponent as ChevronIcon } from "./icons/Chevron.svg";
import { ReactComponent as UserIcon } from "./icons/User.svg";
import { ReactComponent as CheckIcon } from "./icons/Check.svg";
import { useButton } from "@react-aria/button";

export const RoomButton = forwardRef(
  ({ on, className, children, ...rest }, ref) => {
    const { buttonProps } = useButton(rest, ref);
    return (
      <button
        className={classNames(styles.roomButton, className, {
          [styles.on]: on,
        })}
        {...buttonProps}
        ref={ref}
      >
        {children}
      </button>
    );
  }
);

export function DropdownButton({ onChange, options, value, children }) {
  const buttonRef = useRef();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onClick() {
      if (open) {
        setOpen(false);
      }
    }

    window.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className={styles.dropdownButtonContainer}>
      {children}
      <button
        ref={buttonRef}
        className={styles.dropdownButton}
        onClick={() => setOpen(true)}
      >
        <ChevronIcon />
      </button>
      {open && (
        <div className={styles.dropdownContainer}>
          <ul>
            {options.map((item) => (
              <li
                key={item.value}
                className={classNames({
                  [styles.dropdownActiveItem]: item.value === value,
                })}
                onClick={() => onChange(item)}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MicButton({ muted, ...rest }) {
  return (
    <RoomButton {...rest} on={muted}>
      <ButtonTooltip>
        {muted ? "Unmute microphone" : "Mute microphone"}
      </ButtonTooltip>
      {muted ? <MuteMicIcon /> : <MicIcon />}
    </RoomButton>
  );
}

export function VideoButton({ enabled, ...rest }) {
  return (
    <RoomButton {...rest} on={enabled}>
      <ButtonTooltip>
        {enabled ? "Turn off camera" : "Turn on camera"}
      </ButtonTooltip>
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
      <ButtonTooltip>
        {enabled ? "Stop sharing screen" : "Share screen"}
      </ButtonTooltip>
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
      <ButtonTooltip>Leave</ButtonTooltip>
      <HangupIcon />
    </RoomButton>
  );
}

export const HeaderButton = forwardRef(
  ({ on, className, children, ...rest }, ref) => {
    const { buttonProps } = useButton(rest, ref);
    return (
      <button
        className={classNames(styles.headerButton, className, {
          [styles.on]: on,
        })}
        {...buttonProps}
        ref={ref}
      >
        {children}
      </button>
    );
  }
);

export function HeaderDropdownButton({ children, content }) {
  const buttonRef = useRef();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onClick() {
      if (open) {
        setOpen(false);
      }
    }

    window.addEventListener("click", onClick);

    return () => {
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className={styles.dropdownButtonContainer}>
      <button
        ref={buttonRef}
        className={classNames(styles.headerButton, { [styles.on]: open })}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open && (
        <div
          className={classNames(
            styles.dropdownContainer,
            styles.headerDropdownContainer
          )}
        >
          <ul>{content}</ul>
        </div>
      )}
    </div>
  );
}

export function HeaderDropdownItem({ active, children, className, ...rest }) {
  return (
    <li
      className={classNames(className, {
        [styles.dropdownActiveItem]: active,
      })}
      {...rest}
    >
      {children}
    </li>
  );
}

export function UserMenu({ userName, children }) {
  return (
    <HeaderDropdownButton content={children}>
      <ButtonTooltip>Profile</ButtonTooltip>
      <div className={styles.userButton}>
        <UserIcon />
        <span>{userName}</span>
      </div>
    </HeaderDropdownButton>
  );
}

export function SettingsButton(props) {
  return (
    <HeaderButton {...props}>
      <ButtonTooltip>Show Dev Tools</ButtonTooltip>
      <SettingsIcon width={20} height={20} />
    </HeaderButton>
  );
}

export function LayoutToggleButton({ layout, setLayout, ...rest }) {
  return (
    <HeaderDropdownButton
      {...rest}
      content={
        <>
          <HeaderDropdownItem onClick={() => setLayout("freedom")}>
            <FreedomIcon />
            <span>Freedom</span>
            {layout === "freedom" && <CheckIcon className={styles.checkIcon} />}
          </HeaderDropdownItem>
          <HeaderDropdownItem onClick={() => setLayout("spotlight")}>
            <SpotlightIcon />
            <span>Spotlight</span>
            {layout === "spotlight" && (
              <CheckIcon className={styles.checkIcon} />
            )}
          </HeaderDropdownItem>
        </>
      }
    >
      <ButtonTooltip>Layout Type</ButtonTooltip>
      {layout === "spotlight" ? <SpotlightIcon /> : <FreedomIcon />}
    </HeaderDropdownButton>
  );
}

export function ButtonTooltip({ className, children }) {
  return (
    <div className={classNames(styles.buttonTooltip, className)}>
      {children}
    </div>
  );
}
