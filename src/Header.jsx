import classNames from "classnames";
import React, { useRef } from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import { ReactComponent as Logo } from "./icons/Logo.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as ArrowLeftIcon } from "./icons/ArrowLeft.svg";
import { useButton } from "@react-aria/button";
import { Subtitle } from "./typography/Typography";
import { Avatar } from "./Avatar";

export function Header({ children, className, ...rest }) {
  return (
    <header className={classNames(styles.header, className)} {...rest}>
      {children}
    </header>
  );
}

export function LeftNav({ children, className, hideMobile, ...rest }) {
  return (
    <div
      className={classNames(
        styles.nav,
        styles.leftNav,
        { [styles.hideMobile]: hideMobile },
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function RightNav({ children, className, hideMobile, ...rest }) {
  return (
    <div
      className={classNames(
        styles.nav,
        styles.rightNav,
        { [styles.hideMobile]: hideMobile },
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function HeaderLogo({ className }) {
  return (
    <Link className={classNames(styles.headerLogo, className)} to="/">
      <Logo />
    </Link>
  );
}

export function RoomHeaderInfo({ roomName }) {
  return (
    <>
      <div className={styles.roomAvatar}>
        <Avatar
          size="md"
          bgKey={roomName}
          fallback={roomName.slice(0, 1).toUpperCase()}
        />
        <VideoIcon width={16} height={16} />
      </div>
      <Subtitle fontWeight="semiBold">{roomName}</Subtitle>
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
