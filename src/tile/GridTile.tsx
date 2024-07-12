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

import { ComponentProps, forwardRef, useCallback, useState } from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import MicOnSolidIcon from "@vector-im/compound-design-tokens/icons/mic-on-solid.svg?react";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/icons/mic-off-solid.svg?react";
import MicOffIcon from "@vector-im/compound-design-tokens/icons/mic-off.svg?react";
import OverflowHorizontalIcon from "@vector-im/compound-design-tokens/icons/overflow-horizontal.svg?react";
import VolumeOnIcon from "@vector-im/compound-design-tokens/icons/volume-on.svg?react";
import VolumeOffIcon from "@vector-im/compound-design-tokens/icons/volume-off.svg?react";
import UserProfileIcon from "@vector-im/compound-design-tokens/icons/user-profile.svg?react";
import ExpandIcon from "@vector-im/compound-design-tokens/icons/expand.svg?react";
import CollapseIcon from "@vector-im/compound-design-tokens/icons/collapse.svg?react";
import {
  ContextMenu,
  MenuItem,
  ToggleMenuItem,
  Menu,
} from "@vector-im/compound-web";
import { useStateObservable } from "@react-rxjs/core";

import styles from "./GridTile.module.css";
import {
  ScreenShareViewModel,
  MediaViewModel,
  UserMediaViewModel,
  useNameData,
} from "../state/MediaViewModel";
import { subscribe } from "../state/subscribe";
import { Slider } from "../Slider";
import { MediaView } from "./MediaView";

interface UserMediaTileProps {
  vm: UserMediaViewModel;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  maximised: boolean;
  onOpenProfile: () => void;
  showSpeakingIndicator: boolean;
}

const UserMediaTile = subscribe<UserMediaTileProps, HTMLDivElement>(
  (
    {
      vm,
      className,
      style,
      targetWidth,
      targetHeight,
      maximised,
      onOpenProfile,
      showSpeakingIndicator,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const { displayName, nameTag } = useNameData(vm);
    const video = useStateObservable(vm.video);
    const audioEnabled = useStateObservable(vm.audioEnabled);
    const videoEnabled = useStateObservable(vm.videoEnabled);
    const unencryptedWarning = useStateObservable(vm.unencryptedWarning);
    const mirror = useStateObservable(vm.mirror);
    const speaking = useStateObservable(vm.speaking);
    const locallyMuted = useStateObservable(vm.locallyMuted);
    const cropVideo = useStateObservable(vm.cropVideo);
    const localVolume = useStateObservable(vm.localVolume);
    const onChangeMute = useCallback(() => vm.toggleLocallyMuted(), [vm]);
    const onChangeFitContain = useCallback(() => vm.toggleFitContain(), [vm]);
    const onSelectMute = useCallback((e: Event) => e.preventDefault(), []);
    const onSelectFitContain = useCallback(
      (e: Event) => e.preventDefault(),
      [],
    );

    const onChangeLocalVolume = useCallback(
      (v: number) => vm.setLocalVolume(v),
      [vm],
    );

    const MicIcon = audioEnabled ? MicOnSolidIcon : MicOffSolidIcon;
    const VolumeIcon = locallyMuted ? VolumeOffIcon : VolumeOnIcon;

    const [menuOpen, setMenuOpen] = useState(false);
    const menu = vm.local ? (
      <>
        <MenuItem
          Icon={UserProfileIcon}
          label={t("common.profile")}
          onSelect={onOpenProfile}
        />
        <ToggleMenuItem
          Icon={ExpandIcon}
          label={t("video_tile.change_fit_contain")}
          checked={cropVideo}
          onChange={onChangeFitContain}
          onSelect={onSelectFitContain}
        />
      </>
    ) : (
      <>
        <ToggleMenuItem
          Icon={MicOffIcon}
          label={t("video_tile.mute_for_me")}
          checked={locallyMuted}
          onChange={onChangeMute}
          onSelect={onSelectMute}
        />
        <ToggleMenuItem
          Icon={ExpandIcon}
          label={t("video_tile.change_fit_contain")}
          checked={cropVideo}
          onChange={onChangeFitContain}
          onSelect={onSelectFitContain}
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
    );

    const tile = (
      <MediaView
        ref={ref}
        className={classNames(className, styles.tile, {
          [styles.speaking]: showSpeakingIndicator && speaking,
        })}
        data-maximised={maximised}
        style={style}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        video={video}
        videoFit={cropVideo ? "cover" : "contain"}
        mirror={mirror}
        member={vm.member}
        videoEnabled={videoEnabled}
        unencryptedWarning={unencryptedWarning}
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
        displayName={displayName}
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

interface ScreenShareTileProps {
  vm: ScreenShareViewModel;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  maximised: boolean;
  fullscreen: boolean;
  onToggleFullscreen: (itemId: string) => void;
}

const ScreenShareTile = subscribe<ScreenShareTileProps, HTMLDivElement>(
  (
    {
      vm,
      className,
      style,
      targetWidth,
      targetHeight,
      maximised,
      fullscreen,
      onToggleFullscreen,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const { displayName, nameTag } = useNameData(vm);
    const video = useStateObservable(vm.video);
    const unencryptedWarning = useStateObservable(vm.unencryptedWarning);
    const onClickFullScreen = useCallback(
      () => onToggleFullscreen(vm.id),
      [onToggleFullscreen, vm],
    );

    const FullScreenIcon = fullscreen ? CollapseIcon : ExpandIcon;

    return (
      <MediaView
        ref={ref}
        className={classNames(className, styles.tile, {
          [styles.maximised]: maximised,
        })}
        data-maximised={maximised}
        style={style}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        video={video}
        videoFit="contain"
        mirror={false}
        member={vm.member}
        videoEnabled
        unencryptedWarning={unencryptedWarning}
        nameTag={nameTag}
        displayName={displayName}
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
      />
    );
  },
);

ScreenShareTile.displayName = "ScreenShareTile";

interface Props {
  vm: MediaViewModel;
  maximised: boolean;
  fullscreen: boolean;
  onToggleFullscreen: (itemId: string) => void;
  onOpenProfile: () => void;
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  showSpeakingIndicator: boolean;
}

export const GridTile = forwardRef<HTMLDivElement, Props>(
  (
    {
      vm,
      maximised,
      fullscreen,
      onToggleFullscreen,
      onOpenProfile,
      className,
      style,
      targetWidth,
      targetHeight,
      showSpeakingIndicator,
    },
    ref,
  ) => {
    if (vm instanceof UserMediaViewModel) {
      return (
        <UserMediaTile
          ref={ref}
          className={className}
          style={style}
          vm={vm}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          maximised={maximised}
          onOpenProfile={onOpenProfile}
          showSpeakingIndicator={showSpeakingIndicator}
        />
      );
    } else {
      return (
        <ScreenShareTile
          ref={ref}
          className={className}
          style={style}
          vm={vm}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          maximised={maximised}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      );
    }
  },
);

GridTile.displayName = "GridTile";
