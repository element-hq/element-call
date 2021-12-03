import classNames from "classnames";
import React from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import { ReactComponent as LogoIcon } from "./Logo.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as ArrowLeftIcon } from "./icons/ArrowLeft.svg";
import { HeaderDropdownItem, UserMenu } from "./RoomButton";

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
      <LogoIcon width={32} height={32} />
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

export function RoomSetupHeaderInfo({ onBack, roomName }) {
  return (
    <button className={styles.backButton} onClick={onBack}>
      <ArrowLeftIcon width={16} height={16} />
      <RoomHeaderInfo roomName={roomName} />
    </button>
  );
}

export function UserDropdownMenu({ userName, signedIn, onLogout }) {
  if (!signedIn) {
    return null;
  }

  return (
    <UserMenu userName={userName}>
      <HeaderDropdownItem onClick={onLogout} className={styles.signOutButton}>
        Sign Out
      </HeaderDropdownItem>
    </UserMenu>
  );
}
