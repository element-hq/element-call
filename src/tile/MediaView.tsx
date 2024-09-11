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
  encryptionKeyMissing: boolean;
  encryptionKeyInvalid: boolean;
  nameTagLeadingIcon?: ReactNode;
  displayName: string;
  participantId: string;
  primaryButton?: ReactNode;
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
      encryptionKeyMissing,
      encryptionKeyInvalid,
      participantId,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();

    return (
      <animated.div
        className={classNames(styles.media, className, {
          [styles.mirror]: mirror,
          [styles.videoMuted]:
            !videoEnabled || encryptionKeyInvalid || encryptionKeyMissing,
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
            size={Math.round(Math.min(targetWidth, targetHeight) / 2)}
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
          {encryptionKeyMissing && (
            <div className={styles.status}>
              <Text as="span" size="sm" weight="medium" className={styles.name}>
                Encryption key missing
              </Text>
            </div>
          )}
          {encryptionKeyInvalid && (
            <div className={styles.status}>
              <Text as="span" size="sm" weight="medium" className={styles.name}>
                Encryption key invalid
              </Text>
            </div>
          )}
          <div className={styles.nameTag} title={participantId}>
            {nameTagLeadingIcon}
            <Text as="span" size="sm" weight="medium" className={styles.name}>
              {displayName} ({participantId})
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
                  aria-hidden
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
