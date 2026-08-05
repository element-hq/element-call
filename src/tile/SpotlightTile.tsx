/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ComponentProps,
  type FC,
  type Ref,
  type RefAttributes,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ExpandIcon,
  CollapseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  VolumeOffSolidIcon,
  VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { animated } from "@react-spring/web";
import { type Observable, map } from "rxjs";
import { useObservableRef } from "observable-hooks";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { type TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { Menu, MenuItem, Text } from "@vector-im/compound-web";

import FullScreenMaximiseIcon from "../icons/FullScreenMaximise.svg?react";
import FullScreenMinimiseIcon from "../icons/FullScreenMinimise.svg?react";
import { MediaView } from "./MediaView";
import styles from "./SpotlightTile.module.css";
import { useInitial } from "../useInitial";
import { useMergedRefs } from "../useMergedRefs";
import { useReactiveState } from "../useReactiveState";
import { useLatest } from "../useLatest";
import { type SpotlightTileViewModel } from "../state/TileViewModel";
import { useBehavior } from "../useBehavior";
import { type MemberMediaViewModel } from "../state/media/MemberMediaViewModel";
import { type LocalUserMediaViewModel } from "../state/media/LocalUserMediaViewModel";
import { type RemoteUserMediaViewModel } from "../state/media/RemoteUserMediaViewModel";
import { type UserMediaViewModel } from "../state/media/UserMediaViewModel";
import { type ScreenShareViewModel } from "../state/media/ScreenShareViewModel";
import { type RemoteScreenShareViewModel } from "../state/media/RemoteScreenShareViewModel";
import { type MediaViewModel } from "../state/media/MediaViewModel";
import { Slider } from "../Slider";
import { platform } from "../Platform";
import { type RingingMediaViewModel } from "../state/media/RingingMediaViewModel";
import { RingingStatus } from "./RingingStatus";

interface SpotlightItemBaseProps {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  "data-id": string;
  targetWidth: number;
  targetHeight: number;
  userId: string;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  showNameTags: boolean;
  background: "solid" | "transparent";
  focusable: boolean;
  "aria-hidden"?: boolean;
}

interface SpotlightMemberMediaItemBaseProps extends SpotlightItemBaseProps {
  video: TrackReferenceOrPlaceholder | undefined;
  unencryptedWarning: boolean;
  focusUrl: string | undefined;
}

interface SpotlightUserMediaItemBaseProps extends SpotlightMemberMediaItemBaseProps {
  videoFit: "contain" | "cover";
  videoEnabled: boolean;
  soundWaves: boolean | undefined;
}

interface SpotlightLocalUserMediaItemProps extends SpotlightUserMediaItemBaseProps {
  vm: LocalUserMediaViewModel;
}

const SpotlightLocalUserMediaItem: FC<SpotlightLocalUserMediaItemProps> = ({
  vm,
  ...props
}) => {
  const mirror = useBehavior(vm.mirror$);
  return <MediaView mirror={mirror} {...props} />;
};

SpotlightLocalUserMediaItem.displayName = "SpotlightLocalUserMediaItem";

interface SpotlightRemoteUserMediaItemProps extends SpotlightUserMediaItemBaseProps {
  vm: RemoteUserMediaViewModel;
}

const SpotlightRemoteUserMediaItem: FC<SpotlightRemoteUserMediaItemProps> = ({
  vm,
  ...props
}) => {
  const waitingForMedia = useBehavior(vm.waitingForMedia$);
  return (
    <MediaView waitingForMedia={waitingForMedia} mirror={false} {...props} />
  );
};

interface SpotlightUserMediaItemProps extends SpotlightMemberMediaItemBaseProps {
  vm: UserMediaViewModel;
}

const SpotlightUserMediaItem: FC<SpotlightUserMediaItemProps> = ({
  vm,
  targetWidth,
  targetHeight,
  ...props
}) => {
  const videoFit = useBehavior(vm.videoFit$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const speaking = useBehavior(vm.speaking$);

  // Whenever target bounds change, inform the viewModel
  useEffect(() => {
    if (targetWidth > 0 && targetHeight > 0) {
      vm.setTargetDimensions(targetWidth, targetHeight);
    }
  }, [targetWidth, targetHeight, vm]);

  const baseProps: SpotlightUserMediaItemBaseProps &
    RefAttributes<HTMLDivElement> = {
    videoFit,
    videoEnabled,
    soundWaves: props.background === "transparent" ? speaking : undefined,
    targetWidth,
    targetHeight,
    ...props,
  };

  return vm.local ? (
    <SpotlightLocalUserMediaItem vm={vm} {...baseProps} />
  ) : (
    <SpotlightRemoteUserMediaItem vm={vm} {...baseProps} />
  );
};

SpotlightUserMediaItem.displayName = "SpotlightUserMediaItem";

interface SpotlightScreenShareItemProps extends SpotlightMemberMediaItemBaseProps {
  vm: ScreenShareViewModel;
  videoEnabled: boolean;
}

const SpotlightScreenShareItem: FC<SpotlightScreenShareItemProps> = ({
  vm,
  ...props
}) => {
  return <MediaView videoFit="contain" mirror={false} {...props} />;
};

interface SpotlightRemoteScreenShareItemProps extends SpotlightMemberMediaItemBaseProps {
  vm: RemoteScreenShareViewModel;
}

const SpotlightRemoteScreenShareItem: FC<
  SpotlightRemoteScreenShareItemProps
> = ({ vm, ...props }) => {
  const videoEnabled = useBehavior(vm.videoEnabled$);
  return (
    <SpotlightScreenShareItem vm={vm} videoEnabled={videoEnabled} {...props} />
  );
};

interface SpotlightMemberMediaItemProps extends SpotlightItemBaseProps {
  vm: MemberMediaViewModel;
}

const SpotlightMemberMediaItem: FC<SpotlightMemberMediaItemProps> = ({
  vm,
  ...props
}) => {
  const video = useBehavior(vm.video$);
  const unencryptedWarning = useBehavior(vm.unencryptedWarning$);
  const focusUrl = useBehavior(vm.focusUrl$);

  const baseProps: SpotlightMemberMediaItemBaseProps &
    RefAttributes<HTMLDivElement> = {
    video: video ?? undefined,
    unencryptedWarning,
    focusUrl,
    ...props,
  };

  if (vm.type === "user")
    return <SpotlightUserMediaItem vm={vm} {...baseProps} />;
  return vm.local ? (
    <SpotlightScreenShareItem vm={vm} videoEnabled {...baseProps} />
  ) : (
    <SpotlightRemoteScreenShareItem vm={vm} {...baseProps} />
  );
};

interface SpotlightRingingMediaItemProps extends SpotlightItemBaseProps {
  vm: RingingMediaViewModel;
  showStatus: boolean;
}

const SpotlightRingingMediaItem: FC<SpotlightRingingMediaItemProps> = ({
  vm,
  showStatus,
  ...props
}) => {
  return (
    <MediaView
      video={undefined}
      unencryptedWarning={false}
      status={
        showStatus && (
          <Text as="span" size="md" weight="medium">
            <RingingStatus vm={vm} />
          </Text>
        )
      }
      avatarStyle="translucent"
      videoEnabled={false}
      videoFit="cover"
      mirror={false}
      {...props}
    />
  );
};

interface SpotlightItemProps {
  ref?: Ref<HTMLDivElement>;
  vm: MediaViewModel;
  /**
   * The width this tile will have once its animations have settled.
   */
  targetWidth: number;
  /**
   * The height this tile will have once its animations have settled.
   */
  targetHeight: number;
  showNameTags: boolean;
  showRingingStatus: boolean;
  background: "solid" | "transparent";
  focusable: boolean;
  intersectionObserver$: Observable<IntersectionObserver>;
  /**
   * Whether this item should act as a scroll snapping point.
   */
  snap: boolean;
  className?: string;
  "aria-hidden"?: boolean;
}

const SpotlightItem: FC<SpotlightItemProps> = ({
  ref: theirRef,
  vm,
  targetWidth,
  targetHeight,
  showNameTags,
  showRingingStatus,
  background,
  focusable,
  intersectionObserver$,
  snap,
  className,
  "aria-hidden": ariaHidden,
}) => {
  const ourRef = useRef<HTMLDivElement | null>(null);

  const ref = useMergedRefs(ourRef, theirRef);
  const displayName = useBehavior(vm.displayName$);
  const mxcAvatarUrl = useBehavior(vm.mxcAvatarUrl$);

  // Hook this item up to the intersection observer
  useEffect(() => {
    const element = ourRef.current!;
    let prevIo: IntersectionObserver | null = null;
    const subscription = intersectionObserver$.subscribe((io) => {
      prevIo?.unobserve(element);
      io.observe(element);
      prevIo = io;
    });
    return (): void => {
      subscription.unsubscribe();
      prevIo?.unobserve(element);
    };
  }, [intersectionObserver$]);

  const baseProps: SpotlightItemBaseProps & RefAttributes<HTMLDivElement> = {
    ref,
    "data-id": vm.id,
    className: classNames(className, styles.item, { [styles.snap]: snap }),
    targetWidth,
    targetHeight,
    userId: vm.userId,
    displayName,
    mxcAvatarUrl,
    showNameTags,
    background,
    focusable,
    "aria-hidden": ariaHidden,
  };

  return vm.type === "ringing" ? (
    <SpotlightRingingMediaItem
      vm={vm}
      showStatus={showRingingStatus}
      {...baseProps}
    />
  ) : (
    <SpotlightMemberMediaItem vm={vm} {...baseProps} />
  );
};

SpotlightItem.displayName = "SpotlightItem";

interface ScreenShareVolumeButtonProps {
  vm: RemoteScreenShareViewModel;
}

const ScreenShareVolumeButton: FC<ScreenShareVolumeButtonProps> = ({ vm }) => {
  const { t } = useTranslation();

  const audioEnabled = useBehavior(vm.audioEnabled$);
  const playbackMuted = useBehavior(vm.playbackMuted$);
  const playbackVolume = useBehavior(vm.playbackVolume$);

  const VolumeIcon = playbackMuted ? VolumeOffIcon : VolumeOnIcon;
  const VolumeSolidIcon = playbackMuted
    ? VolumeOffSolidIcon
    : VolumeOnSolidIcon;

  const [volumeMenuOpen, setVolumeMenuOpen] = useState(false);
  const onMuteButtonClick = useCallback(() => vm.togglePlaybackMuted(), [vm]);
  const onVolumeChange = useCallback(
    (v: number) => vm.adjustPlaybackVolume(v),
    [vm],
  );
  const onVolumeCommit = useCallback(() => vm.commitPlaybackVolume(), [vm]);

  return (
    audioEnabled && (
      <Menu
        open={volumeMenuOpen}
        onOpenChange={setVolumeMenuOpen}
        title={t("video_tile.screen_share_volume")}
        side="top"
        align="end"
        trigger={
          <button
            className={styles.expand}
            aria-label={t("video_tile.screen_share_volume")}
          >
            <VolumeSolidIcon aria-hidden width={20} height={20} />
          </button>
        }
      >
        <MenuItem
          as="div"
          className={styles.volumeMenuItem}
          onSelect={null}
          label={null}
          hideChevron={true}
        >
          <button className={styles.menuMuteButton} onClick={onMuteButtonClick}>
            <VolumeIcon aria-hidden width={24} height={24} />
          </button>
          <Slider
            className={styles.volumeSlider}
            label={t("video_tile.volume")}
            value={playbackVolume}
            min={0}
            max={1}
            step={0.01}
            onValueChange={onVolumeChange}
            onValueCommit={onVolumeCommit}
          />
        </MenuItem>
      </Menu>
    )
  );
};

interface Props {
  ref?: Ref<HTMLDivElement>;
  vm: SpotlightTileViewModel;
  expanded: boolean;
  onToggleExpanded: (() => void) | null;
  targetWidth: number;
  targetHeight: number;
  showIndicators: boolean;
  showNameTags: boolean;
  showRingingStatus: boolean;
  focusable: boolean;
  className?: string;
  /**
   * CSS class of the individual spotlight items.
   */
  itemClassName?: string;
  style?: ComponentProps<typeof animated.div>["style"];
}

export const SpotlightTile: FC<Props> = ({
  ref: theirRef,
  vm,
  expanded,
  onToggleExpanded,
  targetWidth,
  targetHeight,
  showIndicators,
  showNameTags,
  showRingingStatus,
  focusable = true,
  className,
  itemClassName,
  style,
}) => {
  const { t } = useTranslation();
  const [ourRef, root$] = useObservableRef<HTMLDivElement | null>(null);
  const ref = useMergedRefs(ourRef, theirRef);
  const maximised = useBehavior(vm.maximised$);
  const background = useBehavior(vm.background$);
  const media = useBehavior(vm.media$);
  const [visibleId, setVisibleId] = useState<string | undefined>(media[0]?.id);
  const latestMedia = useLatest(media);
  const latestVisibleId = useLatest(visibleId);
  const visibleIndex = media.findIndex((vm) => vm.id === visibleId);
  const visibleMedia = media.at(visibleIndex);
  const canGoBack = visibleIndex > 0;
  const canGoToNext = visibleIndex !== -1 && visibleIndex < media.length - 1;

  const isFullscreen = useCallback((): boolean => {
    const rootElement = document.body;
    if (rootElement && document.fullscreenElement) return true;
    return false;
  }, []);

  const FullScreenIcon = isFullscreen()
    ? FullScreenMinimiseIcon
    : FullScreenMaximiseIcon;

  const onToggleFullscreen = useCallback(() => {
    const rootElement = document.body;
    if (!rootElement) return;
    if (isFullscreen()) {
      void document?.exitFullscreen();
    } else {
      void rootElement.requestFullscreen();
    }
  }, [isFullscreen]);

  // To keep track of which item is visible, we need an intersection observer
  // hooked up to the root element and the items. Because the items will run
  // their effects before their parent does, we need to do this dance with an
  // Observable to actually give them the intersection observer.
  const intersectionObserver$ = useInitial<Observable<IntersectionObserver>>(
    () =>
      root$.pipe(
        map(
          (r) =>
            new IntersectionObserver(
              (entries) => {
                const visible = entries.find((e) => e.isIntersecting);
                if (visible !== undefined)
                  setVisibleId(visible.target.getAttribute("data-id")!);
              },
              { root: r, threshold: 0.5 },
            ),
        ),
      ),
  );

  const [scrollToId, setScrollToId] = useReactiveState<string | null>(
    (prev) =>
      prev == null || prev === visibleId || media.every((vm) => vm.id !== prev)
        ? null
        : prev,
    [visibleId],
  );

  const onBackClick = useCallback(() => {
    const media = latestMedia.current;
    const visibleIndex = media.findIndex(
      (vm) => vm.id === latestVisibleId.current,
    );
    if (visibleIndex > 0) setScrollToId(media[visibleIndex - 1].id);
  }, [latestVisibleId, latestMedia, setScrollToId]);

  const onNextClick = useCallback(() => {
    const media = latestMedia.current;
    const visibleIndex = media.findIndex(
      (vm) => vm.id === latestVisibleId.current,
    );
    if (visibleIndex !== -1 && visibleIndex !== media.length - 1)
      setScrollToId(media[visibleIndex + 1].id);
  }, [latestVisibleId, latestMedia, setScrollToId]);

  const ToggleExpandIcon = expanded ? CollapseIcon : ExpandIcon;

  return (
    <animated.div
      ref={ref}
      className={classNames(className, styles.tile)}
      data-maximised={maximised}
      style={style}
    >
      {canGoBack && (
        <button
          className={classNames(styles.advance, styles.back)}
          aria-label={t("common.back")}
          onClick={onBackClick}
          tabIndex={focusable ? undefined : -1}
        >
          <ChevronLeftIcon aria-hidden width={24} height={24} />
        </button>
      )}
      <div className={styles.contents}>
        {media.map((vm) => (
          <SpotlightItem
            key={vm.id}
            vm={vm}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            showRingingStatus={showRingingStatus}
            showNameTags={showNameTags}
            background={background}
            focusable={focusable}
            intersectionObserver$={intersectionObserver$}
            // This is how we get the container to scroll to the right media
            // when the previous/next buttons are clicked: we temporarily
            // remove all scroll snap points except for just the one media
            // that we want to bring into view
            snap={scrollToId === null || scrollToId === vm.id}
            className={itemClassName}
            aria-hidden={(scrollToId ?? visibleId) !== vm.id}
          />
        ))}
      </div>

      <div className={styles.bottomRightButtons}>
        {visibleMedia?.type === "screen share" && !visibleMedia.local && (
          <ScreenShareVolumeButton vm={visibleMedia} />
        )}
        {platform === "desktop" && (
          <button
            className={classNames(styles.expand)}
            aria-label={"maximise"}
            onClick={onToggleFullscreen}
            tabIndex={focusable ? undefined : -1}
          >
            <FullScreenIcon aria-hidden width={20} height={20} />
          </button>
        )}
        {onToggleExpanded && (
          <button
            className={classNames(styles.expand)}
            aria-label={
              expanded ? t("video_tile.collapse") : t("video_tile.expand")
            }
            onClick={onToggleExpanded}
            tabIndex={focusable ? undefined : -1}
          >
            <ToggleExpandIcon aria-hidden width={20} height={20} />
          </button>
        )}
      </div>

      {canGoToNext && (
        <button
          className={classNames(styles.advance, styles.next)}
          aria-label={t("common.next")}
          onClick={onNextClick}
          tabIndex={focusable ? undefined : -1}
        >
          <ChevronRightIcon aria-hidden width={24} height={24} />
        </button>
      )}
      {!expanded && (
        <div
          className={classNames(styles.indicators, {
            [styles.show]: showIndicators && media.length > 1,
          })}
        >
          {media.map((vm) => (
            <div
              data-testid="screenshare-indicator"
              key={vm.id}
              className={styles.item}
              data-visible={vm.id === visibleId}
            />
          ))}
        </div>
      )}
    </animated.div>
  );
};

SpotlightTile.displayName = "SpotlightTile";
