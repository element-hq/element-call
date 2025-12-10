/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ComponentProps,
  type FC,
  type ReactNode,
  type Ref,
  useCallback,
  useRef,
  useState,
} from "react";
import { type animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import {
  MicOnSolidIcon,
  MicOffSolidIcon,
  MicOffIcon,
  OverflowHorizontalIcon,
  VolumeOnIcon,
  VolumeOffIcon,
  VisibilityOnIcon,
  UserProfileIcon,
  ExpandIcon,
  VolumeOffSolidIcon,
  SwitchCameraSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import {
  ContextMenu,
  MenuItem,
  ToggleMenuItem,
  Menu,
} from "@vector-im/compound-web";
import { useObservableEagerState } from "observable-hooks";

import styles from "./GridTile.module.css";
import {
  type UserMediaViewModel,
  LocalUserMediaViewModel,
  type RemoteUserMediaViewModel,
} from "../state/MediaViewModel";
import { Slider } from "../Slider";
import { MediaView } from "./MediaView";
import { useLatest } from "../useLatest";
import { type GridTileViewModel } from "../state/TileViewModel";
import { useMergedRefs } from "../useMergedRefs";
import { useReactionsSender } from "../reactions/useReactionsSender";
import { useBehavior } from "../useBehavior";

interface TileProps {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  focusUrl: string | undefined;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  showSpeakingIndicators: boolean;
  focusable: boolean;
}

interface UserMediaTileProps extends TileProps {
  vm: UserMediaViewModel;
  mirror: boolean;
  locallyMuted: boolean;
  waitingForMedia?: boolean;
  primaryButton?: ReactNode;
  menuStart?: ReactNode;
  menuEnd?: ReactNode;
}

const UserMediaTile: FC<UserMediaTileProps> = ({
  ref,
  vm,
  showSpeakingIndicators,
  locallyMuted,
  waitingForMedia,
  primaryButton,
  menuStart,
  menuEnd,
  className,
  focusUrl,
  displayName,
  mxcAvatarUrl,
  focusable,
  ...props
}) => {
  const { toggleRaisedHand } = useReactionsSender();
  const { t } = useTranslation();
  const video = useBehavior(vm.video$);
  const unencryptedWarning = useBehavior(vm.unencryptedWarning$);
  const encryptionStatus = useBehavior(vm.encryptionStatus$);
  const audioStreamStats = useObservableEagerState<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >(vm.audioStreamStats$);
  const videoStreamStats = useObservableEagerState<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >(vm.videoStreamStats$);
  const audioEnabled = useBehavior(vm.audioEnabled$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const speaking = useBehavior(vm.speaking$);
  const cropVideo = useBehavior(vm.cropVideo$);
  const onSelectFitContain = useCallback(
    (e: Event) => {
      e.preventDefault();
      vm.toggleFitContain();
    },
    [vm],
  );
  const handRaised = useBehavior(vm.handRaised$);
  const reaction = useBehavior(vm.reaction$);

  const AudioIcon = locallyMuted
    ? VolumeOffSolidIcon
    : audioEnabled
      ? MicOnSolidIcon
      : MicOffSolidIcon;
  const audioIconLabel = locallyMuted
    ? t("video_tile.muted_for_me")
    : audioEnabled
      ? t("microphone_on")
      : t("microphone_off");

  const [menuOpen, setMenuOpen] = useState(false);
  const menu = (
    <>
      {menuStart}
      <ToggleMenuItem
        Icon={ExpandIcon}
        label={t("video_tile.change_fit_contain")}
        checked={cropVideo}
        onSelect={onSelectFitContain}
      />
      {menuEnd}
    </>
  );

  const raisedHandOnClick = vm.local
    ? (): void => void toggleRaisedHand()
    : undefined;

  const showSpeaking = showSpeakingIndicators && speaking;

  const tile = (
    <MediaView
      ref={ref}
      video={video}
      userId={vm.userId}
      unencryptedWarning={unencryptedWarning}
      encryptionStatus={encryptionStatus}
      videoEnabled={videoEnabled}
      videoFit={cropVideo ? "cover" : "contain"}
      className={classNames(className, styles.tile, {
        [styles.speaking]: showSpeaking,
        [styles.handRaised]: !showSpeaking && handRaised,
      })}
      nameTagLeadingIcon={
        <AudioIcon
          width={20}
          height={20}
          aria-label={audioIconLabel}
          data-muted={locallyMuted || !audioEnabled}
          className={styles.muteIcon}
        />
      }
      displayName={displayName}
      mxcAvatarUrl={mxcAvatarUrl}
      focusable={focusable}
      primaryButton={
        primaryButton ?? (
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            title={displayName}
            trigger={
              <button
                aria-label={t("common.options")}
                tabIndex={focusable ? undefined : -1}
              >
                <OverflowHorizontalIcon aria-hidden width={20} height={20} />
              </button>
            }
            side="left"
            align="start"
          >
            {menu}
          </Menu>
        )
      }
      raisedHandTime={handRaised ?? undefined}
      currentReaction={reaction ?? undefined}
      raisedHandOnClick={raisedHandOnClick}
      waitingForMedia={waitingForMedia}
      focusUrl={focusUrl}
      audioStreamStats={audioStreamStats}
      videoStreamStats={videoStreamStats}
      {...props}
    />
  );

  return (
    <ContextMenu title={displayName} trigger={tile} hasAccessibleAlternative>
      {menu}
    </ContextMenu>
  );
};

UserMediaTile.displayName = "UserMediaTile";

interface LocalUserMediaTileProps extends TileProps {
  vm: LocalUserMediaViewModel;
  onOpenProfile: (() => void) | null;
}

const LocalUserMediaTile: FC<LocalUserMediaTileProps> = ({
  ref,
  vm,
  onOpenProfile,
  focusable,
  ...props
}) => {
  const { t } = useTranslation();
  const mirror = useBehavior(vm.mirror$);
  const alwaysShow = useBehavior(vm.alwaysShow$);
  const switchCamera = useBehavior(vm.switchCamera$);

  const latestAlwaysShow = useLatest(alwaysShow);
  const onSelectAlwaysShow = useCallback(
    (e: Event) => {
      e.preventDefault();
      vm.setAlwaysShow(!latestAlwaysShow.current);
    },
    [vm, latestAlwaysShow],
  );

  return (
    <UserMediaTile
      ref={ref}
      vm={vm}
      locallyMuted={false}
      mirror={mirror}
      primaryButton={
        switchCamera === null ? undefined : (
          <button
            className={styles.switchCamera}
            aria-label={t("switch_camera")}
            onClick={switchCamera}
            tabIndex={focusable ? undefined : -1}
          >
            <SwitchCameraSolidIcon aria-hidden width={20} height={20} />
          </button>
        )
      }
      menuStart={
        <ToggleMenuItem
          Icon={VisibilityOnIcon}
          label={t("video_tile.always_show")}
          checked={alwaysShow}
          onSelect={onSelectAlwaysShow}
        />
      }
      menuEnd={
        onOpenProfile && (
          <MenuItem
            Icon={UserProfileIcon}
            label={t("common.profile")}
            onSelect={onOpenProfile}
          />
        )
      }
      focusable={focusable}
      {...props}
    />
  );
};

LocalUserMediaTile.displayName = "LocalUserMediaTile";

interface RemoteUserMediaTileProps extends TileProps {
  vm: RemoteUserMediaViewModel;
}

const RemoteUserMediaTile: FC<RemoteUserMediaTileProps> = ({
  ref,
  vm,
  ...props
}) => {
  const { t } = useTranslation();
  const waitingForMedia = useBehavior(vm.waitingForMedia$);
  const locallyMuted = useBehavior(vm.locallyMuted$);
  const localVolume = useBehavior(vm.localVolume$);
  const onSelectMute = useCallback(
    (e: Event) => {
      e.preventDefault();
      vm.toggleLocallyMuted();
    },
    [vm],
  );
  const onChangeLocalVolume = useCallback(
    (v: number) => vm.setLocalVolume(v),
    [vm],
  );
  const onCommitLocalVolume = useCallback(() => vm.commitLocalVolume(), [vm]);

  const VolumeIcon = locallyMuted ? VolumeOffIcon : VolumeOnIcon;

  return (
    <UserMediaTile
      ref={ref}
      vm={vm}
      waitingForMedia={waitingForMedia}
      locallyMuted={locallyMuted}
      mirror={false}
      menuStart={
        <>
          <ToggleMenuItem
            Icon={MicOffIcon}
            label={t("video_tile.mute_for_me")}
            checked={locallyMuted}
            onSelect={onSelectMute}
          />
          {/* TODO: Figure out how to make this slider keyboard accessible */}
          <MenuItem as="div" Icon={VolumeIcon} label={null} onSelect={null}>
            <Slider
              className={styles.volumeSlider}
              label={t("video_tile.volume")}
              value={localVolume}
              onValueChange={onChangeLocalVolume}
              onValueCommit={onCommitLocalVolume}
              min={0}
              max={1}
              step={0.01}
            />
          </MenuItem>
        </>
      }
      {...props}
    />
  );
};

RemoteUserMediaTile.displayName = "RemoteUserMediaTile";

interface GridTileProps {
  ref?: Ref<HTMLDivElement>;
  vm: GridTileViewModel;
  onOpenProfile: (() => void) | null;
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  showSpeakingIndicators: boolean;
  focusable: boolean;
}

export const GridTile: FC<GridTileProps> = ({
  ref: theirRef,
  vm,
  onOpenProfile,
  ...props
}) => {
  const ourRef = useRef<HTMLDivElement | null>(null);
  const ref = useMergedRefs(ourRef, theirRef);
  const media = useBehavior(vm.media$);
  const focusUrl = useBehavior(media.focusUrl$);
  const displayName = useBehavior(media.displayName$);
  const mxcAvatarUrl = useBehavior(media.mxcAvatarUrl$);

  if (media instanceof LocalUserMediaViewModel) {
    return (
      <LocalUserMediaTile
        ref={ref}
        vm={media}
        onOpenProfile={onOpenProfile}
        focusUrl={focusUrl}
        displayName={displayName}
        mxcAvatarUrl={mxcAvatarUrl}
        {...props}
      />
    );
  } else {
    return (
      <RemoteUserMediaTile
        ref={ref}
        vm={media}
        focusUrl={focusUrl}
        displayName={displayName}
        mxcAvatarUrl={mxcAvatarUrl}
        {...props}
      />
    );
  }
};

GridTile.displayName = "GridTile";
