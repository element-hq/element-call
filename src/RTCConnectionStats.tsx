/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useState, type FC } from "react";
import { Button, Text } from "@vector-im/compound-web";
import {
  MicOnSolidIcon,
  VideoCallSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import classNames from "classnames";

import { Modal } from "./Modal";
import styles from "./RTCConnectionStats.module.css";
import mediaViewStyles from "../src/tile/MediaView.module.css";
interface Props {
  audio?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  video?: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  focusUrl?: string;
}

const extractDomain = (url: string): string => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname; // Returns "kdk.cpm"
  } catch (error) {
    console.error("Invalid URL:", error);
    return url;
  }
};

// This is only used in developer mode for debugging purposes, so we don't need full localization
export const RTCConnectionStats: FC<Props> = ({
  audio,
  video,
  focusUrl,
  ...rest
}) => {
  const [showModal, setShowModal] = useState(false);
  const [modalContents, setModalContents] = useState<
    "video" | "audio" | "none"
  >("none");

  const showFullModal = (contents: "video" | "audio"): void => {
    setShowModal(true);
    setModalContents(contents);
  };

  const onDismissModal = (): void => {
    setShowModal(false);
    setModalContents("none");
  };
  return (
    <div className={classNames(mediaViewStyles.nameTag, styles.statsPill)}>
      <Modal
        title="RTC Connection Stats"
        open={showModal}
        onDismiss={onDismissModal}
      >
        <div className={styles.modal}>
          <pre>
            {modalContents !== "none" &&
              JSON.stringify(
                modalContents === "video" ? video : audio,
                null,
                2,
              )}
          </pre>
        </div>
      </Modal>
      {focusUrl && (
        <div>
          <Text as="span" size="xs" title="focusURL">
            &nbsp;{extractDomain(focusUrl)}
          </Text>
        </div>
      )}
      {audio && (
        <div>
          <Button
            onClick={() => showFullModal("audio")}
            size="sm"
            kind="tertiary"
            Icon={MicOnSolidIcon}
          >
            {"jitter" in audio && typeof audio.jitter === "number" && (
              <Text as="span" size="xs" title="jitter">
                &nbsp;{(audio.jitter * 1000).toFixed(0)}ms
              </Text>
            )}
          </Button>
        </div>
      )}
      {video && (
        <div>
          <Button
            onClick={() => showFullModal("video")}
            size="sm"
            kind="tertiary"
            Icon={VideoCallSolidIcon}
          >
            {!!video?.framesPerSecond && (
              <Text as="span" size="xs" title="frame rate">
                &nbsp;{video.framesPerSecond.toFixed(0)}fps
              </Text>
            )}
            {"jitter" in video && typeof video.jitter === "number" && (
              <Text as="span" size="xs" title="jitter">
                &nbsp;{(video.jitter * 1000).toFixed(0)}ms
              </Text>
            )}
            {"frameHeight" in video &&
              typeof video.frameHeight === "number" &&
              "frameWidth" in video &&
              typeof video.frameWidth === "number" && (
                <Text as="span" size="xs" title="frame size">
                  &nbsp;{video.frameWidth}x{video.frameHeight}
                </Text>
              )}
            {"qualityLimitationReason" in video &&
              typeof video.qualityLimitationReason === "string" &&
              video.qualityLimitationReason !== "none" && (
                <Text as="span" size="xs" title="quality limitation reason">
                  &nbsp;{video.qualityLimitationReason}
                </Text>
              )}
          </Button>
        </div>
      )}
    </div>
  );
};
