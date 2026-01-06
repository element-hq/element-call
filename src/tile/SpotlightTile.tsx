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
  type ReactNode,
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
  MicOnSolidIcon,
  MicOffSolidIcon,
  MicOffIcon,
  VolumeOffSolidIcon,
  OverflowHorizontalIcon,
  VolumeOnIcon,
  VolumeOffIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { animated } from "@react-spring/web";
import { type Observable, map } from "rxjs";
import { useObservableRef } from "observable-hooks";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { type TrackReferenceOrPlaceholder } from "@livekit/components-core";

import FullScreenMaximiseIcon from "../icons/FullScreenMaximise.svg?react";
import FullScreenMinimiseIcon from "../icons/FullScreenMinimise.svg?react";
import { MediaView } from "./MediaView";
import styles from "./SpotlightTile.module.css";
import {
  type EncryptionStatus,
  LocalUserMediaViewModel,
  type MediaViewModel,
  ScreenShareViewModel,
  type UserMediaViewModel,
  type RemoteUserMediaViewModel,
} from "../state/MediaViewModel";
import { useInitial } from "../useInitial";
import { useMergedRefs } from "../useMergedRefs";
import { useReactiveState } from "../useReactiveState";
import { useLatest } from "../useLatest";
import { type SpotlightTileViewModel } from "../state/TileViewModel";
import { useBehavior } from "../useBehavior";

import { Menu, ToggleMenuItem, ContextMenu, MenuItem } from "@vector-im/compound-web";
import { Slider } from "../Slider";
import gridStyles from "../tile/GridTile.module.css";

interface SpotlightItemBaseProps {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  "data-id": string;
  targetWidth: number;
  targetHeight: number;
  video: TrackReferenceOrPlaceholder | undefined;
  videoEnabled: boolean;
  userId: string;
  unencryptedWarning: boolean;
  encryptionStatus: EncryptionStatus;
  focusUrl: string | undefined;
  displayName: string;
  mxcAvatarUrl: string | undefined;
  focusable: boolean;
  "aria-hidden"?: boolean;
  primaryButton?: ReactNode;
  nameTagLeadingIcon?: ReactNode;
}

interface SpotlightUserMediaItemBaseProps extends SpotlightItemBaseProps {
  videoFit: "contain" | "cover";
}

interface SpotlightLocalUserMediaItemProps
  extends SpotlightUserMediaItemBaseProps {
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

interface SpotlightRemoteUserMediaItemProps
  extends SpotlightUserMediaItemBaseProps {
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

interface SpotlightUserMediaItemProps extends SpotlightItemBaseProps {
  vm: UserMediaViewModel;
  hasScreenShare: boolean;
}

const SpotlightUserMediaItem: FC<SpotlightUserMediaItemProps> = ({
  vm,
  hasScreenShare,
  ...props
}) => {
  const { t } = useTranslation();
  const cropVideo = useBehavior(vm.cropVideo$);

  // Menu open state for the spotlight overflow menu
  const [menuOpen, setMenuOpen] = useState(false);

  const hasLocalVolume = "localVolume$" in vm;
  const locallyMuted =
    "locallyMuted$" in vm ? useBehavior((vm as RemoteUserMediaViewModel).locallyMuted$) : false;
  const audioEnabled = useBehavior(vm.audioEnabled$);
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

  const localVolume = hasLocalVolume ? useBehavior((vm as any).localVolume$) as number : undefined;

  const onSelectFitContain = useCallback(
    (e: Event) => {
      e.preventDefault?.();
      vm.toggleFitContain();
    },
    [vm],
  );

  const onSelectMuteForMe = useCallback(
    (e: Event) => {
      e.preventDefault?.();
      if ("toggleLocallyMuted" in vm) (vm as RemoteUserMediaViewModel).toggleLocallyMuted();
    },
    [vm],
  );

  const onVolumeChange = useCallback(
    (value: number) => {
      if ("setLocalVolume" in vm) (vm as any).setLocalVolume(value);
    },
    [vm],
  );

  const onVolumeCommit = useCallback(() => {
    if ("commitLocalVolume" in vm) (vm as any).commitLocalVolume();
  }, [vm]);

  // Menu contents (similar to GridTile when no screenshare present)
  const menuContent = (
    <>
      {"toggleLocallyMuted" in vm ? (
        <ToggleMenuItem
          Icon={MicOffIcon}
          label={t("video_tile.mute_for_me")}
          checked={locallyMuted}
          onSelect={onSelectMuteForMe}
        />
      ) : null}
      <ToggleMenuItem
        Icon={ExpandIcon}
        label={t("video_tile.change_fit_contain")}
        checked={cropVideo}
        onSelect={onSelectFitContain}
      />
      {/* If there is no screenshare in the spotlight*/}
      {!hasScreenShare && hasLocalVolume ? (
        <MenuItem as="div" Icon={locallyMuted ? VolumeOffIcon : VolumeOnIcon} label={null} onSelect={null}>
          <Slider
            className={gridStyles.volumeSlider}
            label={t("video_tile.volume")}
            value={localVolume ?? 1}
            onValueChange={onVolumeChange}
            onValueCommit={onVolumeCommit}
            min={0}
            max={1}
            step={0.01}
          />
        </MenuItem>
      ) : null}
    </>
  );

  // Overflow button menu
  const overflow = (
    <Menu
      title={props.displayName}
      open={menuOpen}
      onOpenChange={setMenuOpen}
      trigger={
        <button
          aria-label={t("common.options")}
          tabIndex={props.focusable ? undefined : -1}
          style={{ position: "relative", zIndex: 9999 }}
        >
          <OverflowHorizontalIcon aria-hidden width={20} height={20} />
        </button>
      }
      side="left"
      align="start"
    >
      {menuContent}
    </Menu>
  );

  const baseProps: SpotlightUserMediaItemBaseProps &
    RefAttributes<HTMLDivElement> = {
    videoFit: cropVideo ? "cover" : "contain",
    ...props,
    nameTagLeadingIcon: (
      <AudioIcon
        width={20}
        height={20}
        aria-label={audioIconLabel}
        data-muted={locallyMuted || !audioEnabled}
      />
    ),
    primaryButton: overflow,
  };


  const tileElement =
    vm instanceof LocalUserMediaViewModel ? (
      <SpotlightLocalUserMediaItem vm={vm} {...baseProps} />
    ) : (
      <SpotlightRemoteUserMediaItem vm={vm} {...baseProps} />
    );

  return (
    <ContextMenu title={props.displayName} trigger={tileElement} hasAccessibleAlternative>
      {menuContent}
    </ContextMenu>
  );
};

SpotlightUserMediaItem.displayName = "SpotlightUserMediaItem";

interface SpotlightItemProps {
  ref?: Ref<HTMLDivElement>;
  vm: MediaViewModel;
  targetWidth: number;
  targetHeight: number;
  focusable: boolean;
  intersectionObserver$: Observable<IntersectionObserver>;
  /**
   * Whether this item should act as a scroll snapping point.
   */
  snap: boolean;
  "aria-hidden"?: boolean;
  hasScreenShare: boolean;
}

const SpotlightItem: FC<SpotlightItemProps> = ({
  ref: theirRef,
  vm,
  targetWidth,
  targetHeight,
  focusable,
  intersectionObserver$,
  snap,
  "aria-hidden": ariaHidden,
  hasScreenShare,
}) => {
  const { t } = useTranslation();
  const ourRef = useRef<HTMLDivElement | null>(null);
  const ref = useMergedRefs(ourRef, theirRef);
  const focusUrl = useBehavior(vm.focusUrl$);
  const displayName = useBehavior(vm.displayName$);
  const mxcAvatarUrl = useBehavior(vm.mxcAvatarUrl$);
  const video = useBehavior(vm.video$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const unencryptedWarning = useBehavior(vm.unencryptedWarning$);
  const encryptionStatus = useBehavior(vm.encryptionStatus$);

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
    className: classNames(styles.item, { [styles.snap]: snap }),
    targetWidth,
    targetHeight,
    video: video ?? undefined,
    videoEnabled,
    userId: vm.userId,
    unencryptedWarning,
    focusUrl,
    displayName,
    mxcAvatarUrl,
    focusable,
    encryptionStatus,
    "aria-hidden": ariaHidden,
  };

  // If this is a screen share, we wrap MediaView with a ContextMenu and provide
  // optional audio controls if the view model exposes them.
  if (vm instanceof ScreenShareViewModel) {
    // Detect presence of volume/mute API on the view model
    const hasToggleLocallyMuted = "toggleLocallyMuted" in vm;
    const hasLocalVolume = "localVolume$" in vm;
    const hasLocallyMuted$ = "locallyMuted$" in vm;

    // read observable values if present
    const localVolume = hasLocalVolume ? useBehavior((vm as any).localVolume$) as number : undefined;
    const locallyMuted = hasLocallyMuted$ ? useBehavior((vm as any).locallyMuted$) as boolean : localVolume === 0;

    const onSelectMuteForMe = useCallback(
      (e: Event) => {
        e.preventDefault?.();
        if (hasToggleLocallyMuted) (vm as any).toggleLocallyMuted();
      },
      [vm, hasToggleLocallyMuted],
    );

    const onVolumeChange = (value: number) => {
      if ("setLocalVolume" in vm) (vm as any).setLocalVolume(value);
    };
    const onVolumeCommit = () => {
      if ("commitLocalVolume" in vm) (vm as any).commitLocalVolume();
    };

    // Build menu content: mute toggle and volume slider if available
    const VolumeIcon = locallyMuted ? VolumeOffIcon : VolumeOnIcon;

    const menuContent = (
      <>
        {hasToggleLocallyMuted ? (
          <ToggleMenuItem
            Icon={MicOffIcon}
            label={t("video_tile.mute_for_me")}
            checked={locallyMuted}
            onSelect={onSelectMuteForMe}
          />
        ) : null}
        {hasLocalVolume ? (
          <MenuItem as="div" Icon={VolumeIcon} label={null} onSelect={null}>
            <Slider
              className={gridStyles.volumeSlider}
              label={t("video_tile.volume")}
              value={localVolume ?? 1}
              onValueChange={onVolumeChange}
              onValueCommit={onVolumeCommit}
              min={0}
              max={1}
              step={0.01}
            />
          </MenuItem>
        ) : null}
      </>
    );

    const tileElement = (
      <MediaView
        videoFit="contain"
        mirror={false}
        {...baseProps}
        nameTagLeadingIcon={
          hasLocallyMuted$
            ?
              (locallyMuted ? <VolumeOffSolidIcon width={20} height={20} /> : <MicOnSolidIcon width={20} height={20} />)
            : undefined
        }
      />
    );

    return (
      <ContextMenu title={displayName} trigger={tileElement} hasAccessibleAlternative>
        {menuContent}
      </ContextMenu>
    );
  }

  return vm instanceof ScreenShareViewModel ? (
    <MediaView videoFit="contain" mirror={false} {...baseProps} />
  ) : (
    <SpotlightUserMediaItem vm={vm} hasScreenShare={hasScreenShare} {...baseProps} />
  );
};

SpotlightItem.displayName = "SpotlightItem";

interface Props {
  ref?: Ref<HTMLDivElement>;
  vm: SpotlightTileViewModel;
  expanded: boolean;
  onToggleExpanded: (() => void) | null;
  targetWidth: number;
  targetHeight: number;
  showIndicators: boolean;
  focusable: boolean;
  className?: string;
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
  focusable = true,
  className,
  style,
}) => {
  const { t } = useTranslation();
  const [ourRef, root$] = useObservableRef<HTMLDivElement | null>(null);
  const ref = useMergedRefs(ourRef, theirRef);
  const maximised = useBehavior(vm.maximised$);
  const media = useBehavior(vm.media$);
  const [visibleId, setVisibleId] = useState<string | undefined>(media[0]?.id);
  const latestMedia = useLatest(media);
  const latestVisibleId = useLatest(visibleId);
  const visibleIndex = media.findIndex((vm) => vm.id === visibleId);
  const canGoBack = visibleIndex > 0;
  const canGoToNext = visibleIndex !== -1 && visibleIndex < media.length - 1;

  // Determine whether any screen sharing is present in this spotlight.
  const hasScreenShare = media.some((m) => m instanceof ScreenShareViewModel);

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
      className={classNames(className, styles.tile, {
        [styles.maximised]: maximised,
      })}
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
            focusable={focusable}
            intersectionObserver$={intersectionObserver$}
            // This is how we get the container to scroll to the right media
            // when the previous/next buttons are clicked: we temporarily
            // remove all scroll snap points except for just the one media
            // that we want to bring into view
            snap={scrollToId === null || scrollToId === vm.id}
            aria-hidden={(scrollToId ?? visibleId) !== vm.id}
            hasScreenShare={hasScreenShare}
          />
        ))}
      </div>
      <div className={styles.bottomRightButtons}>
        <button
          className={classNames(styles.expand)}
          aria-label={t("video_tile.maximise" as any) ?? "maximise"}
          onClick={onToggleFullscreen}
          tabIndex={focusable ? undefined : -1}
        >
          <FullScreenIcon aria-hidden width={20} height={20} />
        </button>

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
