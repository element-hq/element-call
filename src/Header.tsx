/*
Copyright 2022 New Vector Ltd

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

import classNames from "classnames";
import React, { HTMLAttributes, ReactNode, useCallback } from "react";
import { Link } from "react-router-dom";
import { Room } from "matrix-js-sdk/src/models/room";
import { useTranslation } from "react-i18next";

import styles from "./Header.module.css";
import { useModalTriggerState } from "./Modal";
import { Button } from "./button";
import { ReactComponent as Logo } from "./icons/Logo.svg";
import { ReactComponent as VideoIcon } from "./icons/Video.svg";
import { Subtitle } from "./typography/Typography";
import { Avatar, Size } from "./Avatar";
import { IncompatibleVersionModal } from "./IncompatibleVersionModal";

interface HeaderProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
}

export function Header({ children, className, ...rest }: HeaderProps) {
  return (
    <header className={classNames(styles.header, className)} {...rest}>
      {children}
    </header>
  );
}

interface LeftNavProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  hideMobile?: boolean;
}

export function LeftNav({
  children,
  className,
  hideMobile,
  ...rest
}: LeftNavProps) {
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

interface RightNavProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  className?: string;
  hideMobile?: boolean;
}

export function RightNav({
  children,
  className,
  hideMobile,
  ...rest
}: RightNavProps) {
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

interface HeaderLogoProps {
  className?: string;
}

export function HeaderLogo({ className }: HeaderLogoProps) {
  const { t } = useTranslation();

  return (
    <Link
      className={classNames(styles.headerLogo, className)}
      to="/"
      aria-label={t("Element Call Home")}
    >
      <Logo />
    </Link>
  );
}

interface RoomHeaderInfo {
  roomName: string;
  avatarUrl: string;
}

export function RoomHeaderInfo({ roomName, avatarUrl }: RoomHeaderInfo) {
  return (
    <>
      <div className={styles.roomAvatar}>
        <Avatar
          size={Size.MD}
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

interface VersionMismatchWarningProps {
  users: Set<string>;
  room: Room;
}

export function VersionMismatchWarning({
  users,
  room,
}: VersionMismatchWarningProps) {
  const { t } = useTranslation();
  const { modalState, modalProps } = useModalTriggerState();

  const onDetailsClick = useCallback(() => {
    modalState.open();
  }, [modalState]);

  if (users.size === 0) return null;

  return (
    <span className={styles.versionMismatchWarning}>
      {t("Incompatible versions!")}
      <Button variant="link" onClick={onDetailsClick}>
        {t("Details")}
      </Button>
      {modalState.isOpen && (
        <IncompatibleVersionModal userIds={users} room={room} {...modalProps} />
      )}
    </span>
  );
}
