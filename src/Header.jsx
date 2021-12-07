import classNames from "classnames";
import React, { useRef } from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import { ReactComponent as Logo } from "./icons/Logo.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as ArrowLeftIcon } from "./icons/ArrowLeft.svg";
import { useButton } from "@react-aria/button";

export function Header({ children, className, ...rest }) {
  return (
    <header className={classNames(styles.header, className)} {...rest}>
      {children}
    </header>
  );
}

export function LeftNav({ children, className, ...rest }) {
  return (
    <div
      className={classNames(styles.nav, styles.leftNav, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function RightNav({ children, className, ...rest }) {
  return (
    <div
      className={classNames(styles.nav, styles.rightNav, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function HeaderLogo() {
  return (
    <Link className={styles.logo} to="/">
      <Logo />
    </Link>
  );
}

export function RoomHeaderInfo({ roomName }) {
  return (
    <>
      <div className={styles.roomAvatar}>
        <VideoIcon width={16} height={16} />
      </div>
      <h3>{roomName}</h3>
    </>
  );
}

export function RoomSetupHeaderInfo({ roomName, ...rest }) {
  const ref = useRef();
  const { buttonProps } = useButton(rest, ref);
  return (
    <button className={styles.backButton} ref={ref} {...buttonProps}>
      <ArrowLeftIcon width={16} height={16} />
      <RoomHeaderInfo roomName={roomName} />
    </button>
  );
}
