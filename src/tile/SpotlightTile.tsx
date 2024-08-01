/*
Copyright 2024 New Vector Ltd

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
  RefAttributes,
  forwardRef,
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
import { Observable, map } from "rxjs";
import { useObservableEagerState } from "observable-hooks";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { RoomMember } from "matrix-js-sdk";

import { MediaView } from "./MediaView";
import styles from "./SpotlightTile.module.css";
import {
  LocalUserMediaViewModel,
  MediaViewModel,
  ScreenShareViewModel,
  UserMediaViewModel,
  useDisplayName,
} from "../state/MediaViewModel";
import { useInitial } from "../useInitial";
import { useMergedRefs } from "../useMergedRefs";
import { useObservableRef } from "../state/useObservable";
import { useReactiveState } from "../useReactiveState";
import { useLatest } from "../useLatest";

interface SpotlightItemBaseProps {
  className?: string;
  "data-id": string;
  targetWidth: number;
  targetHeight: number;
  video: TrackReferenceOrPlaceholder;
  member: RoomMember | undefined;
  unencryptedWarning: boolean;
  displayName: string;
}

interface SpotlightUserMediaItemBaseProps extends SpotlightItemBaseProps {
  videoEnabled: boolean;
  videoFit: "contain" | "cover";
}

interface SpotlightLocalUserMediaItemProps
  extends SpotlightUserMediaItemBaseProps {
  vm: LocalUserMediaViewModel;
}

const SpotlightLocalUserMediaItem = forwardRef<
  HTMLDivElement,
  SpotlightLocalUserMediaItemProps
>(({ vm, ...props }, ref) => {
  const mirror = useObservableEagerState(vm.mirror);
  return <MediaView ref={ref} mirror={mirror} {...props} />;
});

SpotlightLocalUserMediaItem.displayName = "SpotlightLocalUserMediaItem";

interface SpotlightUserMediaItemProps extends SpotlightItemBaseProps {
  vm: UserMediaViewModel;
}

const SpotlightUserMediaItem = forwardRef<
  HTMLDivElement,
  SpotlightUserMediaItemProps
>(({ vm, ...props }, ref) => {
  const videoEnabled = useObservableEagerState(vm.videoEnabled);
  const cropVideo = useObservableEagerState(vm.cropVideo);

  const baseProps: SpotlightUserMediaItemBaseProps = {
    videoEnabled,
    videoFit: cropVideo ? "cover" : "contain",
    ...props,
  };

  return vm instanceof LocalUserMediaViewModel ? (
    <SpotlightLocalUserMediaItem ref={ref} vm={vm} {...baseProps} />
  ) : (
    <MediaView mirror={false} {...baseProps} />
  );
});

SpotlightUserMediaItem.displayName = "SpotlightUserMediaItem";

interface SpotlightItemProps {
  vm: MediaViewModel;
  targetWidth: number;
  targetHeight: number;
  intersectionObserver: Observable<IntersectionObserver>;
  /**
   * Whether this item should act as a scroll snapping point.
   */
  snap: boolean;
}

const SpotlightItem = forwardRef<HTMLDivElement, SpotlightItemProps>(
  ({ vm, targetWidth, targetHeight, intersectionObserver, snap }, theirRef) => {
    const ourRef = useRef<HTMLDivElement | null>(null);
    const ref = useMergedRefs(ourRef, theirRef);
    const displayName = useDisplayName(vm);
    const video = useObservableEagerState(vm.video);
    const unencryptedWarning = useObservableEagerState(vm.unencryptedWarning);

    // Hook this item up to the intersection observer
    useEffect(() => {
      const element = ourRef.current!;
      let prevIo: IntersectionObserver | null = null;
      const subscription = intersectionObserver.subscribe((io) => {
        prevIo?.unobserve(element);
        io.observe(element);
        prevIo = io;
      });
      return (): void => {
        subscription.unsubscribe();
        prevIo?.unobserve(element);
      };
    }, [intersectionObserver]);

    const baseProps: SpotlightItemBaseProps & RefAttributes<HTMLDivElement> = {
      ref,
      "data-id": vm.id,
      className: classNames(styles.item, { [styles.snap]: snap }),
      targetWidth,
      targetHeight,
      video,
      member: vm.member,
      unencryptedWarning,
      displayName,
    };

    return vm instanceof ScreenShareViewModel ? (
      <MediaView
        videoEnabled
        videoFit="contain"
        mirror={false}
        {...baseProps}
      />
    ) : (
      <SpotlightUserMediaItem vm={vm} {...baseProps} />
    );
  },
);

SpotlightItem.displayName = "SpotlightItem";

interface Props {
  vms: MediaViewModel[];
  maximised: boolean;
  expanded: boolean;
  onToggleExpanded: (() => void) | null;
  targetWidth: number;
  targetHeight: number;
  showIndicators: boolean;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
}

export const SpotlightTile = forwardRef<HTMLDivElement, Props>(
  (
    {
      vms,
      maximised,
      expanded,
      onToggleExpanded,
      targetWidth,
      targetHeight,
      showIndicators,
      className,
      style,
    },
    theirRef,
  ) => {
    const { t } = useTranslation();
    const [root, ourRef] = useObservableRef<HTMLDivElement | null>(null);
    const ref = useMergedRefs(ourRef, theirRef);
    const [visibleId, setVisibleId] = useState(vms[0].id);
    const latestVms = useLatest(vms);
    const latestVisibleId = useLatest(visibleId);
    const visibleIndex = vms.findIndex((vm) => vm.id === visibleId);
    const canGoBack = visibleIndex > 0;
    const canGoToNext = visibleIndex !== -1 && visibleIndex < vms.length - 1;

    // To keep track of which item is visible, we need an intersection observer
    // hooked up to the root element and the items. Because the items will run
    // their effects before their parent does, we need to do this dance with an
    // Observable to actually give them the intersection observer.
    const intersectionObserver = useInitial<Observable<IntersectionObserver>>(
      () =>
        root.pipe(
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
        prev == null || prev === visibleId || vms.every((vm) => vm.id !== prev)
          ? null
          : prev,
      [visibleId],
    );

    const onBackClick = useCallback(() => {
      const vms = latestVms.current;
      const visibleIndex = vms.findIndex(
        (vm) => vm.id === latestVisibleId.current,
      );
      if (visibleIndex > 0) setScrollToId(vms[visibleIndex - 1].id);
    }, [latestVisibleId, latestVms, setScrollToId]);

    const onNextClick = useCallback(() => {
      const vms = latestVms.current;
      const visibleIndex = vms.findIndex(
        (vm) => vm.id === latestVisibleId.current,
      );
      if (visibleIndex !== -1 && visibleIndex !== vms.length - 1)
        setScrollToId(vms[visibleIndex + 1].id);
    }, [latestVisibleId, latestVms, setScrollToId]);

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
          >
            <ChevronLeftIcon aria-hidden width={24} height={24} />
          </button>
        )}
        {vms.map((vm) => (
          <SpotlightItem
            key={vm.id}
            vm={vm}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            intersectionObserver={intersectionObserver}
            snap={scrollToId === null || scrollToId === vm.id}
          />
        ))}
        {onToggleExpanded && (
          <button
            className={classNames(styles.expand)}
            aria-label={
              expanded
                ? t("video_tile.full_screen")
                : t("video_tile.exit_full_screen")
            }
            onClick={onToggleExpanded}
          >
            <ToggleExpandIcon aria-hidden width={20} height={20} />
          </button>
        )}
        {canGoToNext && (
          <button
            className={classNames(styles.advance, styles.next)}
            aria-label={t("common.next")}
            onClick={onNextClick}
          >
            <ChevronRightIcon aria-hidden width={24} height={24} />
          </button>
        )}
        {!expanded && (
          <div
            className={classNames(styles.indicators, {
              [styles.show]: showIndicators && vms.length > 1,
            })}
          >
            {vms.map((vm) => (
              <div className={styles.item} data-visible={vm.id === visibleId} />
            ))}
          </div>
        )}
      </animated.div>
    );
  },
);

SpotlightTile.displayName = "SpotlightTile";
