/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ComputerIcon,
  UserProfileSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { type TrackReference } from "@livekit/components-core";
import { VideoTrack } from "@livekit/components-react";
import classNames from "classnames";
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type MediaViewModel } from "../state/media/MediaViewModel";
import { type ScreenShareViewModel } from "../state/media/ScreenShareViewModel";
import { type LocalScreenShareViewModel } from "../state/media/LocalScreenShareViewModel";
import { type RemoteScreenShareViewModel } from "../state/media/RemoteScreenShareViewModel";
import { useBehavior } from "../useBehavior";
import styles from "./SpotlightIndicator.module.css";

interface SpotlightIndicatorProps {
  vm: MediaViewModel;
  visible: boolean;
  focusable: boolean;
  /**
   * Whether to attach the screen share preview. The indicator row is kept
   * mounted even while hidden so that it can fade, but LiveKit's visibility
   * detection ignores opacity, so an attached preview would keep streaming
   * while invisible.
   */
  showPreview: boolean;
  onClick: (id: string) => void;
}

interface ScreenShareIndicatorPreviewProps {
  vm: ScreenShareViewModel;
  displayName: string;
  showPreview: boolean;
}

interface ScreenShareIndicatorPreviewContentProps {
  video: TrackReference | undefined;
  videoEnabled: boolean;
  displayName: string;
}

const screenShareAspectRatio = (video: TrackReference | undefined): number => {
  const { width, height } = video?.publication.dimensions ?? {};
  return width && height ? width / height : 16 / 9;
};

const ScreenShareIndicatorPreviewContent: FC<
  ScreenShareIndicatorPreviewContentProps
> = ({ video, videoEnabled, displayName }) => {
  const [aspectRatio, setAspectRatio] = useState(() =>
    screenShareAspectRatio(video),
  );

  useEffect(() => setAspectRatio(screenShareAspectRatio(video)), [video]);

  return (
    <>
      <span className={styles.preview} style={{ aspectRatio }}>
        {video !== undefined && videoEnabled ? (
          <VideoTrack
            trackRef={video}
            tabIndex={-1}
            disablePictureInPicture
            className={styles.previewVideo}
            data-testid="spotlight-indicator-preview"
            onLoadedMetadata={(event): void => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth > 0 && videoHeight > 0)
                setAspectRatio(videoWidth / videoHeight);
            }}
          />
        ) : (
          <ComputerIcon
            aria-hidden
            width={24}
            height={24}
            className={styles.previewFallback}
          />
        )}
      </span>
      <span className={styles.name}>{displayName}</span>
    </>
  );
};

interface LocalScreenShareIndicatorPreviewProps {
  vm: LocalScreenShareViewModel;
  displayName: string;
  showPreview: boolean;
}

const LocalScreenShareIndicatorPreview: FC<
  LocalScreenShareIndicatorPreviewProps
> = ({ vm, displayName, showPreview }) => {
  const video = useBehavior(vm.video$);

  return (
    <ScreenShareIndicatorPreviewContent
      video={video}
      videoEnabled={showPreview}
      displayName={displayName}
    />
  );
};

interface RemoteScreenShareIndicatorPreviewProps {
  vm: RemoteScreenShareViewModel;
  displayName: string;
  showPreview: boolean;
}

const RemoteScreenShareIndicatorPreview: FC<
  RemoteScreenShareIndicatorPreviewProps
> = ({ vm, displayName, showPreview }) => {
  const video = useBehavior(vm.video$);
  const videoEnabled = useBehavior(vm.videoEnabled$);

  return (
    <ScreenShareIndicatorPreviewContent
      video={video}
      videoEnabled={videoEnabled && showPreview}
      displayName={displayName}
    />
  );
};

const ScreenShareIndicatorPreview: FC<ScreenShareIndicatorPreviewProps> = ({
  vm,
  displayName,
  showPreview,
}) =>
  vm.local ? (
    <LocalScreenShareIndicatorPreview
      vm={vm}
      displayName={displayName}
      showPreview={showPreview}
    />
  ) : (
    <RemoteScreenShareIndicatorPreview
      vm={vm}
      displayName={displayName}
      showPreview={showPreview}
    />
  );

export const SpotlightIndicator: FC<SpotlightIndicatorProps> = ({
  vm,
  visible,
  focusable,
  showPreview,
  onClick,
}) => {
  const { t } = useTranslation();
  const displayName = useBehavior(vm.displayName$);
  const screenShare = vm.type === "screen share";
  const label = screenShare
    ? t("video_tile.screen_share_name", { displayName })
    : displayName;
  const onPreviewIndicatorClick = useCallback(
    () => onClick(vm.id),
    [onClick, vm.id],
  );

  return (
    <button
      data-testid="spotlight-indicator"
      data-id={vm.id}
      data-type={screenShare ? "screen share" : "user"}
      className={classNames(styles.indicator, {
        [styles.screenShare]: screenShare,
      })}
      data-visible={visible}
      aria-current={visible}
      aria-label={label}
      onClick={onPreviewIndicatorClick}
      tabIndex={focusable ? undefined : -1}
    >
      {screenShare ? (
        <ScreenShareIndicatorPreview
          vm={vm}
          displayName={displayName}
          showPreview={showPreview}
        />
      ) : (
        <>
          <UserProfileSolidIcon aria-hidden width={16} height={16} />
          <span className={styles.name}>{label}</span>
        </>
      )}
    </button>
  );
};

SpotlightIndicator.displayName = "SpotlightIndicator";
