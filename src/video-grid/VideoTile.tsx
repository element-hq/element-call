/*
Copyright 2022-2023 New Vector Ltd

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
  ForwardedRef,
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from "react";
import { animated } from "@react-spring/web";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import {
  TrackReferenceOrPlaceholder,
  VideoTrack,
} from "@livekit/components-react";
import {
  RoomMember,
  RoomMemberEvent,
} from "matrix-js-sdk/src/models/room-member";
import MicOnSolidIcon from "@vector-im/compound-design-tokens/icons/mic-on-solid.svg?react";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/icons/mic-off-solid.svg?react";
import ErrorIcon from "@vector-im/compound-design-tokens/icons/error.svg?react";
import MicOffIcon from "@vector-im/compound-design-tokens/icons/mic-off.svg?react";
import OverflowHorizontalIcon from "@vector-im/compound-design-tokens/icons/overflow-horizontal.svg?react";
import VolumeOnIcon from "@vector-im/compound-design-tokens/icons/volume-on.svg?react";
import VolumeOffIcon from "@vector-im/compound-design-tokens/icons/volume-off.svg?react";
import UserProfileIcon from "@vector-im/compound-design-tokens/icons/user-profile.svg?react";
import ExpandIcon from "@vector-im/compound-design-tokens/icons/expand.svg?react";
import CollapseIcon from "@vector-im/compound-design-tokens/icons/collapse.svg?react";
import {
  Text,
  Tooltip,
  ContextMenu,
  MenuItem,
  ToggleMenuItem,
  Menu,
} from "@vector-im/compound-web";
import { useStateObservable } from "@react-rxjs/core";
import useRelativeTime from "@nkzw/use-relative-time";

import { Avatar } from "../Avatar";
import styles from "./VideoTile.module.css";
import { useReactiveState } from "../useReactiveState";
import {
  ScreenShareViewModel,
  MediaViewModel,
  UserMediaViewModel,
  MembershipOnlyViewModel,
} from "../state/MediaViewModel";
import { subscribe } from "../state/subscribe";
import { useMergedRefs } from "../useMergedRefs";
import { Slider } from "../Slider";

interface TileProps {
  tileRef?: ForwardedRef<HTMLDivElement>;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  video?: TrackReferenceOrPlaceholder;
  member: RoomMember | undefined;
  videoEnabled: boolean;
  maximised: boolean;
  unencryptedWarning: boolean;
  nameTagLeadingIcon?: ReactNode;
  nameTag: string;
  displayName: string;
  primaryButton: ReactNode;
  secondaryButton?: ReactNode;
  [k: string]: unknown;
}

const Tile = forwardRef<HTMLDivElement, TileProps>(
  (
    {
      tileRef = null,
      className,
      style,
      targetWidth,
      targetHeight,
      video,
      member,
      videoEnabled,
      maximised,
      unencryptedWarning,
      nameTagLeadingIcon,
      nameTag,
      displayName,
      primaryButton,
      secondaryButton,
      ...props
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const mergedRef = useMergedRefs(tileRef, ref);

    const joinedCallTime = member?.events.member?.getTs() ?? 0;

    const joinedCallAgo = useRelativeTime(joinedCallTime ?? 0);

    return (
      <animated.div
        className={classNames(styles.videoTile, className, {
          [styles.maximised]: maximised,
          [styles.videoMuted]: !videoEnabled,
        })}
        style={style}
        ref={mergedRef}
        data-testid="videoTile"
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
          {video?.publication !== undefined && (
            <VideoTrack
              trackRef={video}
              // There's no reason for this to be focusable
              tabIndex={-1}
              disablePictureInPicture
            />
          )}
          {!video && member && joinedCallTime > 0 && (
            <div style={{ textAlign: "center" }}>
              <span title={member.userId}>{nameTag}</span> joined the call{" "}
              <span title={new Date(joinedCallTime).toLocaleString()}>
                {joinedCallAgo}
              </span>{" "}
              but is currently unreachable. Are they having connection problems?
            </div>
          )}
        </div>
        <div className={styles.fg}>
          <div className={styles.nameTag}>
            {nameTagLeadingIcon}
            <Text as="span" size="sm" weight="medium" className={styles.name}>
              <span title={member?.userId}>{nameTag}</span>{" "}
            </Text>
            {unencryptedWarning && (
              <Tooltip
                label={t("common.unencrypted")}
                side="bottom"
                isTriggerInteractive={false}
              >
                <ErrorIcon
                  width={20}
                  height={20}
                  aria-label={t("common.unencrypted")}
                  className={styles.errorIcon}
                />
              </Tooltip>
            )}
          </div>
          {primaryButton}
          {secondaryButton}
        </div>
      </animated.div>
    );
  },
);

Tile.displayName = "Tile";

interface UserMediaTileProps {
  vm: UserMediaViewModel;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  nameTag: string;
  displayName: string;
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
      nameTag,
      displayName,
      maximised,
      onOpenProfile,
      showSpeakingIndicator,
    },
    ref,
  ) => {
    const { t } = useTranslation();
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
      <Tile
        tileRef={ref}
        className={classNames(className, {
          [styles.mirror]: mirror,
          [styles.speaking]: showSpeakingIndicator && speaking,
          [styles.cropVideo]: cropVideo,
        })}
        style={style}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        video={video}
        member={vm.member}
        videoEnabled={videoEnabled}
        maximised={maximised}
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
  nameTag: string;
  displayName: string;
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
      nameTag,
      displayName,
      maximised,
      fullscreen,
      onToggleFullscreen,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const video = useStateObservable(vm.video);
    const unencryptedWarning = useStateObservable(vm.unencryptedWarning);
    const onClickFullScreen = useCallback(
      () => onToggleFullscreen(vm.id),
      [onToggleFullscreen, vm],
    );

    const FullScreenIcon = fullscreen ? CollapseIcon : ExpandIcon;

    return (
      <Tile
        ref={ref}
        className={classNames(className, styles.screenshare)}
        style={style}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        video={video}
        member={vm.member}
        videoEnabled={true}
        maximised={maximised}
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

interface MembershipOnlyTileProps {
  vm: MembershipOnlyViewModel;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  targetWidth: number;
  targetHeight: number;
  nameTag: string;
  displayName: string;
  maximised: boolean;
  fullscreen: boolean;
  onToggleFullscreen: (itemId: string) => void;
}

const MembershipOnlyTile = subscribe<MembershipOnlyTileProps, HTMLDivElement>(
  (
    {
      vm,
      className,
      style,
      targetWidth,
      targetHeight,
      nameTag,
      displayName,
      maximised,
      fullscreen,
      onToggleFullscreen,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const onClickFullScreen = useCallback(
      () => onToggleFullscreen(vm.id),
      [onToggleFullscreen, vm],
    );

    const FullScreenIcon = fullscreen ? CollapseIcon : ExpandIcon;

    return (
      <Tile
        ref={ref}
        className={classNames(className, styles.membershipOnly)}
        style={style}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        member={vm.member}
        videoEnabled={true}
        maximised={maximised}
        unencryptedWarning={false}
        nameTag={nameTag}
        displayName={displayName}
        primaryButton={
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
        }
      />
    );
  },
);

MembershipOnlyTile.displayName = "MembershipOnlyTile";

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

export const VideoTile = forwardRef<HTMLDivElement, Props>(
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
    const { t } = useTranslation();

    // Handle display name changes.
    // TODO: Move this into the view model
    const [displayName, setDisplayName] = useReactiveState(
      () => vm.member?.rawDisplayName ?? "[👻]",
      [vm.member],
    );
    useEffect(() => {
      if (vm.member) {
        const updateName = (): void => {
          setDisplayName(vm.member!.rawDisplayName);
        };

        vm.member!.on(RoomMemberEvent.Name, updateName);
        return (): void => {
          vm.member!.removeListener(RoomMemberEvent.Name, updateName);
        };
      }
    }, [vm.member, setDisplayName]);
    const nameTag = vm.local
      ? t("video_tile.sfu_participant_local")
      : displayName;

    if (vm instanceof UserMediaViewModel) {
      return (
        <UserMediaTile
          ref={ref}
          className={className}
          style={style}
          vm={vm}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          nameTag={nameTag}
          displayName={displayName}
          maximised={maximised}
          onOpenProfile={onOpenProfile}
          showSpeakingIndicator={showSpeakingIndicator}
        />
      );
    } else if (vm instanceof ScreenShareViewModel) {
      return (
        <ScreenShareTile
          ref={ref}
          className={className}
          style={style}
          vm={vm}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          nameTag={nameTag}
          displayName={displayName}
          maximised={maximised}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      );
    } else if (vm instanceof MembershipOnlyViewModel) {
      return (
        <MembershipOnlyTile
          ref={ref}
          className={className}
          style={style}
          vm={vm}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          nameTag={nameTag}
          displayName={displayName}
          maximised={maximised}
          fullscreen={fullscreen}
          onToggleFullscreen={onToggleFullscreen}
        />
      );
    }
  },
);

VideoTile.displayName = "VideoTile";
