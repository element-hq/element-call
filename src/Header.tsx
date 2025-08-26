/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import classNames from "classnames";
import { type Ref, type FC, type HTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heading, Text } from "@vector-im/compound-web";
import { UserProfileIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./Header.module.css";
import Logo from "./icons/Logo.svg?react";
import { Avatar, Size } from "./Avatar";
import { EncryptionLock } from "./room/EncryptionLock";
import { useMediaQuery } from "./useMediaQuery";
import { DisconnectedBanner } from "./DisconnectedBanner";

interface HeaderProps extends HTMLAttributes<HTMLElement> {
  ref?: Ref<HTMLElement>;
  children: ReactNode;
  className?: string;
  /**
   * Whether the header should display an informational banner whenever the
   * client is disconnected from the homeserver.
   * @default true
   */
  disconnectedBanner?: boolean;
}

export const Header: FC<HeaderProps> = ({
  ref,
  children,
  className,
  disconnectedBanner = true,
  ...rest
}) => {
  return (
    <>
      <header
        ref={ref}
        className={classNames(styles.header, className)}
        {...rest}
      >
        {children}
      </header>
      {disconnectedBanner && <DisconnectedBanner />}
    </>
  );
};

Header.displayName = "Header";

interface LeftNavProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
  hideMobile?: boolean;
}

export const LeftNav: FC<LeftNavProps> = ({
  children,
  className,
  hideMobile,
  ...rest
}) => {
  return (
    <div
      className={classNames(
        styles.nav,
        styles.leftNav,
        { [styles.hideMobile]: hideMobile },
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

interface RightNavProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  className?: string;
  hideMobile?: boolean;
}

export const RightNav: FC<RightNavProps> = ({
  children,
  className,
  hideMobile,
  ...rest
}) => {
  return (
    <div
      className={classNames(
        styles.nav,
        styles.rightNav,
        { [styles.hideMobile]: hideMobile },
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
};

interface HeaderLogoProps {
  className?: string;
}

export const HeaderLogo: FC<HeaderLogoProps> = ({ className }) => {
  const { t } = useTranslation();

  return (
    <Link
      className={classNames(styles.headerLogo, className)}
      to="/"
      aria-label={t("header_label")}
    >
      <Logo />
    </Link>
  );
};

interface RoomHeaderInfoProps {
  id: string;
  name: string;
  avatarUrl: string | null;
  encrypted: boolean;
  participantCount: number | null;
}

export const RoomHeaderInfo: FC<RoomHeaderInfoProps> = ({
  id,
  name,
  avatarUrl,
  encrypted,
  participantCount,
}) => {
  const { t } = useTranslation();
  const size = useMediaQuery("(max-width: 550px)") ? "sm" : "lg";

  return (
    <div className={styles.roomHeaderInfo} data-size={size}>
      <Avatar
        className={styles.roomAvatar}
        id={id}
        name={name}
        size={size === "sm" ? Size.SM : 56}
        src={avatarUrl ?? undefined}
      />
      <div className={styles.nameLine}>
        <Heading
          type={size === "sm" ? "body" : "heading"}
          size={size === "sm" ? "lg" : "md"}
          weight="semibold"
          data-testid="roomHeader_roomName"
        >
          {name}
        </Heading>
        <EncryptionLock encrypted={encrypted} />
      </div>
      {(participantCount ?? 0) > 0 && (
        <div className={styles.participantsLine}>
          <UserProfileIcon
            width={20}
            height={20}
            aria-label={t("header_participants_label")}
          />
          <Text
            as="span"
            size="sm"
            weight="medium"
            data-testid="roomHeader_participants_count"
          >
            {t("participant_count", { count: participantCount ?? 0 })}
          </Text>
        </div>
      )}
    </div>
  );
};
