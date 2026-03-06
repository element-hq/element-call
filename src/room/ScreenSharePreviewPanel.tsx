/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { Text } from "@vector-im/compound-web";
import { VideoTrack } from "@livekit/components-react";

import { type ScreenShareViewModel } from "../state/media/ScreenShareViewModel";
import { useBehavior } from "../useBehavior";
import styles from "./ScreenSharePreviewPanel.module.css";

interface PreviewTileProps {
  vm: ScreenShareViewModel;
  accepted: boolean;
  onToggle: () => void;
}

const PreviewTile: FC<PreviewTileProps> = ({ vm, accepted, onToggle }) => {
  const { t } = useTranslation();
  const displayName = useBehavior(vm.displayName$);
  const video = useBehavior(vm.video$);

  return (
    <button
      className={classNames(styles.tile, { [styles.accepted]: accepted })}
      onClick={onToggle}
      type="button"
      aria-pressed={accepted}
      aria-label={displayName}
    >
      {video?.publication !== undefined && (
        <VideoTrack trackRef={video} tabIndex={-1} disablePictureInPicture />
      )}
      <div className={styles.tileOverlay}>
        <Text as="span" size="sm" weight="medium">
          {displayName}
        </Text>
        {accepted && (
          <span className={styles.badge}>{t("screenshare_tile_viewing")}</span>
        )}
      </div>
    </button>
  );
};

interface ScreenSharePreviewPanelProps {
  screenShares: ScreenShareViewModel[];
  acceptedIds: Set<string>;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}

export const ScreenSharePreviewPanel: FC<ScreenSharePreviewPanelProps> = ({
  screenShares,
  acceptedIds,
  onAccept,
  onDismiss,
}) => {
  const remoteShares = screenShares.filter((s) => !s.local);

  return (
    <div className={styles.panel}>
      {remoteShares.map((vm) => {
        const accepted = acceptedIds.has(vm.id);
        return (
          <PreviewTile
            key={vm.id}
            vm={vm}
            accepted={accepted}
            onToggle={(): void => {
              if (accepted) {
                onDismiss(vm.id);
              } else {
                onAccept(vm.id);
              }
            }}
          />
        );
      })}
    </div>
  );
};
