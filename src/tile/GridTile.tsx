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
  UserMediaViewModel,
  useDisplayName,
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
  displayName: string;
  showVideo: boolean;
  showSpeakingIndicators: boolean;
}

interface UserMediaTileProps extends TileProps {
  vm: UserMediaViewModel;
  mirror: boolean;
  menuStart?: ReactNode;
  menuEnd?: ReactNode;
}

const UserMediaTile = forwardRef<HTMLDivElement, UserMediaTileProps>(
  (
    {
      vm,
      showVideo,
      showSpeakingIndicators,
      menuStart,
      menuEnd,
      className,
      displayName,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const video = useObservableEagerState(vm.video);
    const unencryptedWarning = useObservableEagerState(vm.unencryptedWarning);
    const audioEnabled = useObservableEagerState(vm.audioEnabled);
    const videoEnabled = useObservableEagerState(vm.videoEnabled);
    const speaking = useObservableEagerState(vm.speaking);
    const cropVideo = useObservableEagerState(vm.cropVideo);
    const onSelectFitContain = useCallback(
      (e: Event) => {
        e.preventDefault();
        vm.toggleFitContain();
      },
      [vm],
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
          onSelect={onSelectFitContain}
        />
        {menuEnd}
      </>
    );

    const tile = (
      <MediaView
        ref={ref}
        video={video}
        member={vm.member}
        unencryptedWarning={unencryptedWarning}
        videoEnabled={videoEnabled && showVideo}
        videoFit={cropVideo ? "cover" : "contain"}
        className={classNames(className, styles.tile, {
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
        displayName={displayName}
        primaryButton={
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            title={displayName}
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
      <ContextMenu title={displayName} trigger={tile} hasAccessibleAlternative>
        {menu}
      </ContextMenu>
    );
  },
);

UserMediaTile.displayName = "UserMediaTile";

interface LocalUserMediaTileProps extends TileProps {
  vm: LocalUserMediaViewModel;
  onOpenProfile: () => void;
}

const LocalUserMediaTile = forwardRef<HTMLDivElement, LocalUserMediaTileProps>(
  ({ vm, onOpenProfile, ...props }, ref) => {
    const { t } = useTranslation();
    const mirror = useObservableEagerState(vm.mirror);
    const alwaysShow = useObservableEagerState(vm.alwaysShow);
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
        mirror={mirror}
        menuStart={
          <ToggleMenuItem
            Icon={VisibilityOnIcon}
            label={t("video_tile.always_show")}
            checked={alwaysShow}
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
}

const RemoteUserMediaTile = forwardRef<
  HTMLDivElement,
  RemoteUserMediaTileProps
>(({ vm, ...props }, ref) => {
  const { t } = useTranslation();
  const locallyMuted = useObservableEagerState(vm.locallyMuted);
  const localVolume = useObservableEagerState(vm.localVolume);
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

interface GridTileProps {
  vm: UserMediaViewModel;
  onOpenProfile: () => void;
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  showVideo: boolean;
  showSpeakingIndicators: boolean;
}

export const GridTile = forwardRef<HTMLDivElement, GridTileProps>(
  ({ vm, onOpenProfile, ...props }, ref) => {
    const displayName = useDisplayName(vm);

    if (vm instanceof LocalUserMediaViewModel) {
      return (
        <LocalUserMediaTile
          ref={ref}
          vm={vm}
          onOpenProfile={onOpenProfile}
          displayName={displayName}
          {...props}
        />
      );
    } else {
      return (
        <RemoteUserMediaTile
          ref={ref}
          vm={vm}
          displayName={displayName}
          {...props}
        />
      );
    }
  },
);

GridTile.displayName = "GridTile";
