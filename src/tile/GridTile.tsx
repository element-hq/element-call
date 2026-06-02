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
  useEffect,
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
import { Slider } from "../Slider";
import { MediaView } from "./MediaView";
import { useLatest } from "../useLatest";
import { type GridTileViewModel } from "../state/TileViewModel";
import { useMergedRefs } from "../useMergedRefs";
import { useReactionsSender } from "../reactions/useReactionsSender";
import { useBehavior } from "../useBehavior";
import { type LocalUserMediaViewModel } from "../state/media/LocalUserMediaViewModel";
import { type RemoteUserMediaViewModel } from "../state/media/RemoteUserMediaViewModel";
import { type UserMediaViewModel } from "../state/media/UserMediaViewModel";

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
  playbackMuted: boolean;
  waitingForMedia?: boolean;
  primaryButton?: ReactNode;
  menuStart?: ReactNode;
  menuEnd?: ReactNode;
}

const UserMediaTile: FC<UserMediaTileProps> = ({
  ref,
  vm,
  showSpeakingIndicators,
  playbackMuted,
  waitingForMedia,
  primaryButton,
  menuStart,
  menuEnd,
  className,
  focusUrl,
  displayName,
  mxcAvatarUrl,
  focusable,
  targetWidth,
  targetHeight,
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
  const videoFit = useBehavior(vm.videoFit$);

  const rtcBackendIdentity = vm.rtcBackendIdentity;
  const handRaised = useBehavior(vm.handRaised$);
  const reaction = useBehavior(vm.reaction$);

  // Whenever bounds change, inform the viewModel
  useEffect(() => {
    if (targetWidth > 0 && targetHeight > 0) {
      vm.setTargetDimensions(targetWidth, targetHeight);
    }
  }, [targetWidth, targetHeight, vm]);

  const AudioIcon = playbackMuted
    ? VolumeOffSolidIcon
    : audioEnabled
      ? MicOnSolidIcon
      : MicOffSolidIcon;
  const audioIconLabel = playbackMuted
    ? t("video_tile.muted_for_me")
    : audioEnabled
      ? t("microphone_on")
      : t("microphone_off");

  const [menuOpen, setMenuOpen] = useState(false);
  const menu = (
    <>
      {menuStart}
      {/*
       No additional menu item (used to be the manual fit to frame.
       Placeholder for future menu items that should be placed here.
       */}
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
      videoFit={videoFit}
      className={classNames(className, styles.tile, {
        [styles.speaking]: showSpeaking,
        [styles.handRaised]: !showSpeaking && handRaised,
      })}
      nameTagLeadingIcon={
        <AudioIcon
          width={20}
          height={20}
          aria-label={audioIconLabel}
          data-muted={playbackMuted || !audioEnabled}
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
      rtcBackendIdentity={rtcBackendIdentity}
      targetWidth={targetWidth}
      targetHeight={targetHeight}
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
      playbackMuted={false}
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
  const playbackMuted = useBehavior(vm.playbackMuted$);
  const playbackVolume = useBehavior(vm.playbackVolume$);
  const onSelectMute = useCallback(
    (e: Event) => {
      e.preventDefault();
      vm.togglePlaybackMuted();
    },
    [vm],
  );

  const VolumeIcon = playbackMuted ? VolumeOffIcon : VolumeOnIcon;

  return (
    <UserMediaTile
      ref={ref}
      vm={vm}
      waitingForMedia={waitingForMedia}
      playbackMuted={playbackMuted}
      mirror={false}
      menuStart={
        <>
          <ToggleMenuItem
            Icon={MicOffIcon}
            label={t("video_tile.mute_for_me")}
            checked={playbackMuted}
            onSelect={onSelectMute}
          />
          {/* TODO: Figure out how to make this slider keyboard accessible */}
          <MenuItem as="div" Icon={VolumeIcon} label={null} onSelect={null}>
            <Slider
              className={styles.volumeSlider}
              label={t("video_tile.volume")}
              value={playbackVolume}
              onValueChange={vm.adjustPlaybackVolume}
              onValueCommit={vm.commitPlaybackVolume}
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

  if (media.local) {
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
