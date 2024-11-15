/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { animated } from "@react-spring/web";
import { RoomMember } from "matrix-js-sdk/src/matrix";
import { ComponentProps, ReactNode, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { VideoTrack } from "@livekit/components-react";
import { Text, Tooltip } from "@vector-im/compound-web";
import { ErrorIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./MediaView.module.css";
import { Avatar } from "../Avatar";
import { EncryptionStatus } from "../state/MediaViewModel";
import { RaisedHandIndicator } from "../reactions/RaisedHandIndicator";
import { showHandRaisedTimer, useSetting } from "../settings/settings";
import { ReactionOption } from "../reactions";
import { ReactionIndicator } from "../reactions/ReactionIndicator";

interface Props extends ComponentProps<typeof animated.div> {
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  video: TrackReferenceOrPlaceholder;
  videoFit: "cover" | "contain";
  mirror: boolean;
  member: RoomMember | undefined;
  videoEnabled: boolean;
  unencryptedWarning: boolean;
  encryptionStatus: EncryptionStatus;
  nameTagLeadingIcon?: ReactNode;
  displayName: string;
  primaryButton?: ReactNode;
  raisedHandTime?: Date;
  currentReaction?: ReactionOption;
  raisedHandOnClick?: () => void;
}

export const MediaView = forwardRef<HTMLDivElement, Props>(
  (
    {
      className,
      style,
      targetWidth,
      targetHeight,
      video,
      videoFit,
      mirror,
      member,
      videoEnabled,
      unencryptedWarning,
      nameTagLeadingIcon,
      displayName,
      primaryButton,
      encryptionStatus,
      raisedHandTime,
      currentReaction,
      raisedHandOnClick,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [handRaiseTimerVisible] = useSetting(showHandRaisedTimer);

    const avatarSize = Math.round(Math.min(targetWidth, targetHeight) / 2);

    return (
      <animated.div
        className={classNames(styles.media, className, {
          [styles.mirror]: mirror,
          [styles.videoMuted]: !videoEnabled,
        })}
        style={style}
        ref={ref}
        data-testid="videoTile"
        data-video-fit={videoFit}
        {...props}
      >
        <div className={styles.bg}>
          <Avatar
            id={member?.userId ?? displayName}
            name={displayName}
            size={avatarSize}
            src={member?.getMxcAvatarUrl()}
            className={styles.avatar}
          />
          {video.publication !== undefined && (
            <VideoTrack
              trackRef={video}
              // There's no reason for this to be focusable
              tabIndex={-1}
              disablePictureInPicture
            />
          )}
        </div>
        <div className={styles.fg}>
          <div style={{ display: "flex", gap: "var(--cpd-space-1x)" }}>
            <RaisedHandIndicator
              raisedHandTime={raisedHandTime}
              miniature={avatarSize < 96}
              showTimer={handRaiseTimerVisible}
              onClick={raisedHandOnClick}
            />
            {currentReaction && (
              <ReactionIndicator
                miniature={avatarSize < 96}
                emoji={currentReaction.emoji}
              />
            )}
          </div>
          {/* TODO: Bring this back once encryption status is less broken */}
          {/*encryptionStatus !== EncryptionStatus.Okay && (
            <div className={styles.status}>
              <Text as="span" size="sm" weight="medium" className={styles.name}>
                {encryptionStatus === EncryptionStatus.Connecting &&
                  t("e2ee_encryption_status.connecting")}
                {encryptionStatus === EncryptionStatus.KeyMissing &&
                  t("e2ee_encryption_status.key_missing")}
                {encryptionStatus === EncryptionStatus.KeyInvalid &&
                  t("e2ee_encryption_status.key_invalid")}
                {encryptionStatus === EncryptionStatus.PasswordInvalid &&
                  t("e2ee_encryption_status.password_invalid")}
              </Text>
            </div>
          )*/}
          <div className={styles.nameTag}>
            {nameTagLeadingIcon}
            <Text as="span" size="sm" weight="medium" className={styles.name}>
              {displayName}
            </Text>
            {unencryptedWarning && (
              <Tooltip
                label={t("common.unencrypted")}
                placement="bottom"
                isTriggerInteractive={false}
              >
                <ErrorIcon
                  width={20}
                  height={20}
                  className={styles.errorIcon}
                />
              </Tooltip>
            )}
          </div>
          {primaryButton}
        </div>
      </animated.div>
    );
  },
);

MediaView.displayName = "MediaView";
