import classNames from "classnames";
import React, { useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import { ReactComponent as Logo } from "./icons/Logo.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { ReactComponent as ArrowLeftIcon } from "./icons/ArrowLeft.svg";
import { useButton } from "@react-aria/button";
import { Subtitle } from "./typography/Typography";
import { Avatar } from "./Avatar";
import { IncompatibleVersionModal } from "./IncompatibleVersionModal";
import { useModalTriggerState } from "./Modal";
import { Button } from "./button";

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

export function RoomHeaderInfo({ roomName, avatarUrl }) {
  return (
    <>
      <div className={styles.roomAvatar}>
        <Avatar
          size="md"
          src={avatarUrl}
          bgKey={roomName}
          fallback={roomName.slice(0, 1).toUpperCase()}
        />
        <VideoIcon width={16} height={16} />
      </div>
      <Subtitle fontWeight="semiBold">{roomName}</Subtitle>
    </>
  );
}

export function RoomSetupHeaderInfo({
  roomName,
  avatarUrl,
  isEmbedded,
  ...rest
}) {
  const ref = useRef();
  const { buttonProps } = useButton(rest, ref);

  if (isEmbedded) {
    return (
      <div ref={ref}>
        <RoomHeaderInfo roomName={roomName} avatarUrl={avatarUrl} />
      </div>
    );
  }

  return (
    <button className={styles.backButton} ref={ref} {...buttonProps}>
      <ArrowLeftIcon width={16} height={16} />
      <RoomHeaderInfo roomName={roomName} avatarUrl={avatarUrl} />
    </button>
  );
}

export function VersionMismatchWarning({ users, room }) {
  const { modalState, modalProps } = useModalTriggerState();

  const onDetailsClick = useCallback(() => {
    modalState.open();
  }, [modalState]);

  if (users.size === 0) return null;

  return (
    <span className={styles.versionMismatchWarning}>
      Incomaptible versions!
      <Button variant="link" onClick={onDetailsClick}>
        Details
      </Button>
      {modalState.isOpen && (
        <IncompatibleVersionModal userIds={users} room={room} {...modalProps} />
      )}
    </span>
  );
}
