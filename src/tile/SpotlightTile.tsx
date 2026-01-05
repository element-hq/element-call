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
  localParticipant: boolean;
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
}

const SpotlightUserMediaItem: FC<SpotlightUserMediaItemProps> = ({
  vm,
  ...props
}) => {
  const cropVideo = useBehavior(vm.cropVideo$);

  const baseProps: SpotlightUserMediaItemBaseProps &
    RefAttributes<HTMLDivElement> = {
    videoFit: cropVideo ? "cover" : "contain",
    ...props,
  };

  return vm instanceof LocalUserMediaViewModel ? (
    <SpotlightLocalUserMediaItem vm={vm} {...baseProps} />
  ) : (
    <SpotlightRemoteUserMediaItem vm={vm} {...baseProps} />
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
}) => {
  const ourRef = useRef<HTMLDivElement | null>(null);
  const ref = useMergedRefs(ourRef, theirRef);
  const focusUrl = useBehavior(vm.focusUrl$);
  const displayName = useBehavior(vm.displayName$);
  const mxcAvatarUrl = useBehavior(vm.mxcAvatarUrl$);
  const video = useBehavior(vm.video$);
  const videoEnabled = useBehavior(vm.videoEnabled$);
  const unencryptedWarning = useBehavior(vm.unencryptedWarning$);
  const encryptionStatus = useBehavior(vm.encryptionStatus$);

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
    localParticipant: vm.local,
  };

  return vm instanceof ScreenShareViewModel ? (
    <MediaView videoFit="contain" mirror={false} {...baseProps} />
  ) : (
    <SpotlightUserMediaItem vm={vm} {...baseProps} />
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
          />
        ))}
      </div>
      <div className={styles.bottomRightButtons}>
        <button
          className={classNames(styles.expand)}
          aria-label={"maximise"}
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
