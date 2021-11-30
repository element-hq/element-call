import classNames from "classnames";
import React from "react";
import { Link, useHistory } from "react-router-dom";
import styles from "./Header.module.css";
import { ReactComponent as LogoIcon } from "./Logo.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as ArrowLeftIcon } from "./icons/ArrowLeft.svg";

export function RoomHeader({ roomName, children }) {
  return (
    <Header>
      <LeftNav>
        <div className={styles.roomAvatar}>
          <VideoIcon width={16} height={16} />
        </div>
        <h3>{roomName}</h3>
      </LeftNav>
      <RightNav>{children}</RightNav>
    </Header>
  );
}

export function RoomSetupHeader({ roomName, children }) {
  const history = useHistory();

  return (
    <Header>
      <LeftNav>
        <button className={styles.backButton} onClick={() => history.goBack()}>
          <ArrowLeftIcon width={16} height={16} />
          <div className={styles.roomAvatar}>
            <VideoIcon width={16} height={16} />
          </div>
          <h3>{roomName}</h3>
        </button>
      </LeftNav>
      <RightNav>{children}</RightNav>
    </Header>
  );
}

export function HomeHeader({ userName, signedIn, onLogout }) {
  return (
    <Header>
      <LeftNav>
        <Link className={styles.logo} to="/">
          <LogoIcon width={32} height={32} />
        </Link>
      </LeftNav>
      {signedIn && (
        <RightNav>
          <span className={styles.userName}>{userName}</span>
          <button
            className={styles.signOutButton}
            type="button"
            onClick={onLogout}
          >
            Sign Out
          </button>
        </RightNav>
      )}
    </Header>
  );
}

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
