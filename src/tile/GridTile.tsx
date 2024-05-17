/*
Copyright 2022-2024 New Vector Ltd

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

import {
  ComponentProps,
  ReactNode,
  forwardRef,
  useCallback,
  useState,
} from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import MicOnSolidIcon from "@vector-im/compound-design-tokens/icons/mic-on-solid.svg?react";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/icons/mic-off-solid.svg?react";
import MicOffIcon from "@vector-im/compound-design-tokens/icons/mic-off.svg?react";
import OverflowHorizontalIcon from "@vector-im/compound-design-tokens/icons/overflow-horizontal.svg?react";
import VolumeOnIcon from "@vector-im/compound-design-tokens/icons/volume-on.svg?react";
import VolumeOffIcon from "@vector-im/compound-design-tokens/icons/volume-off.svg?react";
import VisibilityOnIcon from "@vector-im/compound-design-tokens/icons/visibility-on.svg?react";
import UserProfileIcon from "@vector-im/compound-design-tokens/icons/user-profile.svg?react";
import ExpandIcon from "@vector-im/compound-design-tokens/icons/expand.svg?react";
import CollapseIcon from "@vector-im/compound-design-tokens/icons/collapse.svg?react";
import {
  ContextMenu,
  MenuItem,
  ToggleMenuItem,
  Menu,
} from "@vector-im/compound-web";
import { useObservableEagerState } from "observable-hooks";

import styles from "./GridTile.module.css";
import {
  ScreenShareViewModel,
  MediaViewModel,
  UserMediaViewModel,
  useNameData,
  LocalUserMediaViewModel,
  RemoteUserMediaViewModel,
} from "../state/MediaViewModel";
import { Slider } from "../Slider";
import { MediaView } from "./MediaView";
import { useLatest } from "../useLatest";

interface TileProps {
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  maximised: boolean;
  displayName: string;
  nameTag: string;
}

interface MediaTileProps
  extends TileProps,
    Omit<ComponentProps<typeof animated.div>, "className"> {
  vm: MediaViewModel;
  videoEnabled: boolean;
  videoFit: "contain" | "cover";
  mirror: boolean;
  nameTagLeadingIcon?: ReactNode;
  primaryButton: ReactNode;
  secondaryButton?: ReactNode;
}

const MediaTile = forwardRef<HTMLDivElement, MediaTileProps>(
  ({ vm, className, maximised, ...props }, ref) => {
    const video = useObservableEagerState(vm.video);
    const unencryptedWarning = useObservableEagerState(vm.unencryptedWarning);

    return (
      <MediaView
        ref={ref}
        className={classNames(className, styles.tile)}
        data-maximised={maximised}
        video={video}
        member={vm.member}
        unencryptedWarning={unencryptedWarning}
        {...props}
      />
    );
  },
);

MediaTile.displayName = "MediaTile";

interface UserMediaTileProps extends TileProps {
  vm: UserMediaViewModel;
  mirror: boolean;
  showSpeakingIndicators: boolean;
  menuStart?: ReactNode;
  menuEnd?: ReactNode;
}

const UserMediaTile = forwardRef<HTMLDivElement, UserMediaTileProps>(
  (
    {
      vm,
      showSpeakingIndicators,
      menuStart,
      menuEnd,
      className,
      nameTag,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const audioEnabled = useObservableEagerState(vm.audioEnabled);
    const videoEnabled = useObservableEagerState(vm.videoEnabled);
    const speaking = useObservableEagerState(vm.speaking);
    const cropVideo = useObservableEagerState(vm.cropVideo);
    const onChangeFitContain = useCallback(() => vm.toggleFitContain(), [vm]);
    const onSelectFitContain = useCallback(
      (e: Event) => e.preventDefault(),
      [],
    );

    const MicIcon = audioEnabled ? MicOnSolidIcon : MicOffSolidIcon;

    const [menuOpen, setMenuOpen] = useState(false);
    const menu = (
      <>
        {menuStart}
        <ToggleMenuItem
          Icon={ExpandIcon}
          label={t("video_tile.change_fit_contain")}
          checked={cropVideo}
          onChange={onChangeFitContain}
          onSelect={onSelectFitContain}
        />
        {menuEnd}
      </>
    );

    const tile = (
      <MediaTile
        ref={ref}
        vm={vm}
        videoEnabled={videoEnabled}
        videoFit={cropVideo ? "cover" : "contain"}
        className={classNames(className, {
          [styles.speaking]: showSpeakingIndicators && speaking,
        })}
        nameTagLeadingIcon={
          <MicIcon
            width={20}
            height={20}
            aria-label={audioEnabled ? t("microphone_on") : t("microphone_off")}
            data-muted={!audioEnabled}
            className={styles.muteIcon}
          />
        }
        nameTag={nameTag}
        primaryButton={
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            title={nameTag}
            trigger={
              <button aria-label={t("common.options")}>
                <OverflowHorizontalIcon aria-hidden width={20} height={20} />
              </button>
            }
            side="left"
            align="start"
          >
            {menu}
          </Menu>
        }
        {...props}
      />
    );

    return (
      <ContextMenu title={nameTag} trigger={tile} hasAccessibleAlternative>
        {menu}
      </ContextMenu>
    );
  },
);

UserMediaTile.displayName = "UserMediaTile";

interface LocalUserMediaTileProps extends TileProps {
  vm: LocalUserMediaViewModel;
  onOpenProfile: () => void;
  showSpeakingIndicators: boolean;
}

const LocalUserMediaTile = forwardRef<HTMLDivElement, LocalUserMediaTileProps>(
  ({ vm, onOpenProfile, ...props }, ref) => {
    const { t } = useTranslation();
    const mirror = useObservableEagerState(vm.mirror);
    const alwaysShow = useObservableEagerState(vm.alwaysShow);
    const latestAlwaysShow = useLatest(alwaysShow);
    const onSelectAlwaysShow = useCallback(
      (e: Event) => e.preventDefault(),
      [],
    );
    const onChangeAlwaysShow = useCallback(
      () => vm.setAlwaysShow(!latestAlwaysShow.current),
      [vm, latestAlwaysShow],
    );

    return (
      <UserMediaTile
        ref={ref}
        vm={vm}
        mirror={mirror}
        menuStart={
          <ToggleMenuItem
            Icon={VisibilityOnIcon}
            label={t("video_tile.always_show")}
            checked={alwaysShow}
            onChange={onChangeAlwaysShow}
            onSelect={onSelectAlwaysShow}
          />
        }
        menuEnd={
          <MenuItem
            Icon={UserProfileIcon}
            label={t("common.profile")}
            onSelect={onOpenProfile}
          />
        }
        {...props}
      />
    );
  },
);

LocalUserMediaTile.displayName = "LocalUserMediaTile";

interface RemoteUserMediaTileProps extends TileProps {
  vm: RemoteUserMediaViewModel;
  showSpeakingIndicators: boolean;
}

const RemoteUserMediaTile = forwardRef<
  HTMLDivElement,
  RemoteUserMediaTileProps
>(({ vm, ...props }, ref) => {
  const { t } = useTranslation();
  const locallyMuted = useObservableEagerState(vm.locallyMuted);
  const localVolume = useObservableEagerState(vm.localVolume);
  const onChangeMute = useCallback(() => vm.toggleLocallyMuted(), [vm]);
  const onSelectMute = useCallback((e: Event) => e.preventDefault(), []);
  const onChangeLocalVolume = useCallback(
    (v: number) => vm.setLocalVolume(v),
    [vm],
  );

  const VolumeIcon = locallyMuted ? VolumeOffIcon : VolumeOnIcon;

  return (
    <UserMediaTile
      ref={ref}
      vm={vm}
      mirror={false}
      menuStart={
        <>
          <ToggleMenuItem
            Icon={MicOffIcon}
            label={t("video_tile.mute_for_me")}
            checked={locallyMuted}
            onChange={onChangeMute}
            onSelect={onSelectMute}
          />
          {/* TODO: Figure out how to make this slider keyboard accessible */}
          <MenuItem as="div" Icon={VolumeIcon} label={null} onSelect={null}>
            <Slider
              className={styles.volumeSlider}
              label={t("video_tile.volume")}
              value={localVolume}
              onValueChange={onChangeLocalVolume}
              min={0.1}
              max={1}
              step={0.01}
              disabled={locallyMuted}
            />
          </MenuItem>
        </>
      }
      {...props}
    />
  );
});

RemoteUserMediaTile.displayName = "RemoteUserMediaTile";

interface ScreenShareTileProps extends TileProps {
  vm: ScreenShareViewModel;
  fullscreen: boolean;
  onToggleFullscreen: (itemId: string) => void;
}

const ScreenShareTile = forwardRef<HTMLDivElement, ScreenShareTileProps>(
  ({ vm, fullscreen, onToggleFullscreen, ...props }, ref) => {
    const { t } = useTranslation();
    const onClickFullScreen = useCallback(
      () => onToggleFullscreen(vm.id),
      [onToggleFullscreen, vm],
    );

    const FullScreenIcon = fullscreen ? CollapseIcon : ExpandIcon;

    return (
      <MediaTile
        ref={ref}
        vm={vm}
        videoEnabled
        videoFit="contain"
        mirror={false}
        primaryButton={
          !vm.local && (
            <button
              aria-label={
                fullscreen
                  ? t("video_tile.full_screen")
                  : t("video_tile.exit_full_screen")
              }
              onClick={onClickFullScreen}
            >
              <FullScreenIcon aria-hidden width={20} height={20} />
            </button>
          )
        }
        {...props}
      />
    );
  },
);

ScreenShareTile.displayName = "ScreenShareTile";

interface GridTileProps {
  vm: MediaViewModel;
  maximised: boolean;
  fullscreen: boolean;
  onToggleFullscreen: (itemId: string) => void;
  onOpenProfile: () => void;
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  showSpeakingIndicators: boolean;
}

export const GridTile = forwardRef<HTMLDivElement, GridTileProps>(
  ({ vm, fullscreen, onToggleFullscreen, onOpenProfile, ...props }, ref) => {
    const nameData = useNameData(vm);

    if (vm instanceof LocalUserMediaViewModel) {
      return (
        <LocalUserMediaTile
          ref={ref}
          vm={vm}
          onOpenProfile={onOpenProfile}
          {...props}
          {...nameData}
        />
      );
    } else if (vm instanceof RemoteUserMediaViewModel) {
      return <RemoteUserMediaTile ref={ref} vm={vm} {...props} {...nameData} />;
    } else {
      return (
        <ScreenShareTile
          ref={ref}
          vm={vm}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
          {...props}
          {...nameData}
        />
      );
    }
  },
);

GridTile.displayName = "GridTile";
