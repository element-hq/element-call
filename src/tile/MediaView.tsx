/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { animated } from "@react-spring/web";
import { type FC, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { VideoTrack } from "@livekit/components-react";
import { Text, Tooltip } from "@vector-im/compound-web";
import { ErrorSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./MediaView.module.css";
import { Avatar } from "../Avatar";
import { type EncryptionStatus } from "../state/MediaViewModel";
import { RaisedHandIndicator } from "../reactions/RaisedHandIndicator";
import { showHandRaisedTimer, useSetting } from "../settings/settings";
import { type ReactionOption } from "../reactions";
import { ReactionIndicator } from "../reactions/ReactionIndicator";
import { RTCConnectionStats } from "../RTCConnectionStats";

interface Props extends ComponentProps<typeof animated.div> {
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  video: TrackReferenceOrPlaceholder | undefined;
  videoFit: "cover" | "contain";
  mirror: boolean;
  userId: string;
  videoEnabled: boolean;
  unencryptedWarning: boolean;
  encryptionStatus: EncryptionStatus;
  nameTagLeadingIcon?: ReactNode;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  focusable: boolean;
  primaryButton?: ReactNode;
  raisedHandTime?: Date;
  currentReaction?: ReactionOption;
  raisedHandOnClick?: () => void;
  waitingForMedia?: boolean;
  audioStreamStats?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  videoStreamStats?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  // The focus url, mainly for debugging purposes
  focusUrl?: string;
}

export const MediaView: FC<Props> = ({
  ref,
  className,
  style,
  targetWidth,
  targetHeight,
  video,
  videoFit,
  mirror,
  userId,
  videoEnabled,
  unencryptedWarning,
  nameTagLeadingIcon,
  displayName,
  mxcAvatarUrl,
  focusable,
  primaryButton,
  encryptionStatus,
  raisedHandTime,
  currentReaction,
  raisedHandOnClick,
  waitingForMedia,
  audioStreamStats,
  videoStreamStats,
  focusUrl,
  ...props
}) => {
  const { t } = useTranslation();
  const [handRaiseTimerVisible] = useSetting(showHandRaisedTimer);

  const avatarSize = Math.round(Math.min(targetWidth, targetHeight) / 2);

  return (
    <animated.div
      className={classNames(styles.media, className, {
        [styles.mirror]: mirror,
      })}
      style={style}
      ref={ref}
      data-testid="videoTile"
      data-video-fit={videoFit}
      {...props}
    >
      <div className={styles.bg}>
        <Avatar
          id={userId}
          name={displayName}
          size={avatarSize}
          src={mxcAvatarUrl}
          className={styles.avatar}
          style={{ display: video && videoEnabled ? "none" : "initial" }}
        />
        {video?.publication !== undefined && (
          <VideoTrack
            trackRef={video}
            // There's no reason for this to be focusable
            tabIndex={-1}
            disablePictureInPicture
            style={{ display: video && videoEnabled ? "block" : "none" }}
            data-testid="video"
          />
        )}
      </div>
      <div className={styles.fg}>
        <div className={styles.reactions}>
          <RaisedHandIndicator
            raisedHandTime={raisedHandTime}
            miniature={avatarSize < 96}
            showTimer={handRaiseTimerVisible}
            onClick={raisedHandOnClick}
            tabIndex={focusable ? undefined : -1}
          />
          {currentReaction && (
            <ReactionIndicator
              miniature={avatarSize < 96}
              emoji={currentReaction.emoji}
            />
          )}
        </div>
        {waitingForMedia && (
          <div className={styles.status}>
            {t("video_tile.waiting_for_media")}
          </div>
        )}
        {(audioStreamStats || videoStreamStats) && (
          <RTCConnectionStats
            audio={audioStreamStats}
            video={videoStreamStats}
            focusUrl={focusUrl}
          />
        )}
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
          <Text
            as="span"
            size="sm"
            weight="medium"
            className={styles.name}
            data-testid="name_tag"
          >
            {displayName}
          </Text>
          {unencryptedWarning && (
            <Tooltip
              label={t("common.unencrypted")}
              placement="bottom"
              isTriggerInteractive={false}
              nonInteractiveTriggerTabIndex={focusable ? undefined : -1}
            >
              <ErrorSolidIcon
                width={20}
                height={20}
                className={styles.errorIcon}
                role="img"
                aria-label={t("common.unencrypted")}
              />
            </Tooltip>
          )}
        </div>
        {primaryButton}
      </div>
    </animated.div>
  );
};

MediaView.displayName = "MediaView";
