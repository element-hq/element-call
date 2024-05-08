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
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Glass } from "@vector-im/compound-web";
import ExpandIcon from "@vector-im/compound-design-tokens/icons/expand.svg?react";
import CollapseIcon from "@vector-im/compound-design-tokens/icons/collapse.svg?react";
import ChevronLeftIcon from "@vector-im/compound-design-tokens/icons/chevron-left.svg?react";
import ChevronRightIcon from "@vector-im/compound-design-tokens/icons/chevron-right.svg?react";
import { animated } from "@react-spring/web";
import { state, useStateObservable } from "@react-rxjs/core";
import { Observable, map, of } from "rxjs";
import { useTranslation } from "react-i18next";
import classNames from "classnames";

import { MediaView } from "./MediaView";
import styles from "./SpotlightTile.module.css";
import { subscribe } from "../state/subscribe";
import {
  MediaViewModel,
  UserMediaViewModel,
  useNameData,
} from "../state/MediaViewModel";
import { useInitial } from "../useInitial";
import { useMergedRefs } from "../useMergedRefs";
import { useObservableRef } from "../state/useObservable";
import { useReactiveState } from "../useReactiveState";
import { useLatest } from "../useLatest";

// Screen share video is always enabled
const screenShareVideoEnabled = state(of(true));
// Never mirror screen share video
const screenShareMirror = state(of(false));
// Never crop screen share video
const screenShareCropVideo = state(of(false));

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

const SpotlightItem = subscribe<SpotlightItemProps, HTMLDivElement>(
  ({ vm, targetWidth, targetHeight, intersectionObserver, snap }, theirRef) => {
    const ourRef = useRef<HTMLDivElement | null>(null);
    const ref = useMergedRefs(ourRef, theirRef);
    const { displayName, nameTag } = useNameData(vm);
    const video = useStateObservable(vm.video);
    const videoEnabled = useStateObservable(
      vm instanceof UserMediaViewModel
        ? vm.videoEnabled
        : screenShareVideoEnabled,
    );
    const mirror = useStateObservable(
      vm instanceof UserMediaViewModel ? vm.mirror : screenShareMirror,
    );
    const cropVideo = useStateObservable(
      vm instanceof UserMediaViewModel ? vm.cropVideo : screenShareCropVideo,
    );
    const unencryptedWarning = useStateObservable(vm.unencryptedWarning);

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

    return (
      <MediaView
        ref={ref}
        data-id={vm.id}
        className={classNames(styles.item, { [styles.snap]: snap })}
        targetWidth={targetWidth}
        targetHeight={targetHeight}
        video={video}
        videoFit={cropVideo ? "cover" : "contain"}
        mirror={mirror}
        member={vm.member}
        videoEnabled={videoEnabled}
        unencryptedWarning={unencryptedWarning}
        nameTag={nameTag}
        displayName={displayName}
      />
    );
  },
);

interface Props {
  vms: MediaViewModel[];
  maximised: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  targetWidth: number;
  targetHeight: number;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
}

export const SpotlightTile = forwardRef<HTMLDivElement, Props>(
  (
    {
      vms,
      maximised,
      fullscreen,
      onToggleFullscreen,
      targetWidth,
      targetHeight,
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
    const canGoBack = visibleId !== vms[0].id;
    const canGoToNext = visibleId !== vms[vms.length - 1].id;

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

    const FullScreenIcon = fullscreen ? CollapseIcon : ExpandIcon;

    // We need a wrapper element because Glass doesn't provide an animated.div
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
        <Glass className={styles.border}>
          {/* Similarly we need a wrapper element here because Glass expects a
        single child */}
          <div className={styles.contents}>
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
          </div>
        </Glass>
        <button
          className={classNames(styles.fullScreen)}
          aria-label={
            fullscreen
              ? t("video_tile.full_screen")
              : t("video_tile.exit_full_screen")
          }
          onClick={onToggleFullscreen}
        >
          <FullScreenIcon aria-hidden width={20} height={20} />
        </button>
        {canGoToNext && (
          <button
            className={classNames(styles.advance, styles.next)}
            aria-label={t("common.next")}
            onClick={onNextClick}
          >
            <ChevronRightIcon aria-hidden width={24} height={24} />
          </button>
        )}
      </animated.div>
    );
  },
);

SpotlightTile.displayName = "SpotlightTile";