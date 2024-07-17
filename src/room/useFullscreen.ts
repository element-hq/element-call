/*
Copyright 2023 New Vector Ltd


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

import { logger } from "matrix-js-sdk/src/logger";
import { useCallback, useLayoutEffect, useRef } from "react";

import { useReactiveState } from "../useReactiveState";
import { useEventTarget } from "../useEvents";
import { TileDescriptor } from "../state/CallViewModel";

const isFullscreen = (): boolean =>
  Boolean(document.fullscreenElement) ||
  Boolean(document.webkitFullscreenElement);

function enterFullscreen(): void {
  if (document.body.requestFullscreen) {
    document.body.requestFullscreen();
  } else if (document.body.webkitRequestFullscreen) {
    document.body.webkitRequestFullscreen();
  } else {
    logger.error("No available fullscreen API!");
  }
}

function exitFullscreen(): void {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else {
    logger.error("No available fullscreen API!");
  }
}

function useFullscreenChange(onFullscreenChange: () => void): void {
  useEventTarget(document.body, "fullscreenchange", onFullscreenChange);
  useEventTarget(document.body, "webkitfullscreenchange", onFullscreenChange);
}

/**
 * Provides callbacks for controlling the full-screen view, which can hold one
 * item at a time.
 */
export function useFullscreen<T>(items: TileDescriptor<T>[]): {
  fullscreenItem: TileDescriptor<T> | null;
  toggleFullscreen: (itemId: string) => void;
  exitFullscreen: () => void;
} {
  const [fullscreenItem, setFullscreenItem] =
    useReactiveState<TileDescriptor<T> | null>(
      (prevItem) =>
        prevItem == null
          ? null
          : (items.find((i) => i.id === prevItem.id) ?? null),
      [items],
    );

  const latestItems = useRef<TileDescriptor<T>[]>(items);
  latestItems.current = items;

  const latestFullscreenItem = useRef<TileDescriptor<T> | null>(fullscreenItem);
  latestFullscreenItem.current = fullscreenItem;

  const toggleFullscreen = useCallback(
    (itemId: string) => {
      setFullscreenItem(
        latestFullscreenItem.current === null
          ? (latestItems.current.find((i) => i.id === itemId) ?? null)
          : null,
      );
    },
    [setFullscreenItem],
  );

  const exitFullscreenCallback = useCallback(
    () => setFullscreenItem(null),
    [setFullscreenItem],
  );

  useLayoutEffect(() => {
    // Determine whether we need to change the fullscreen state
    if (isFullscreen() !== (fullscreenItem !== null)) {
      (fullscreenItem === null ? exitFullscreen : enterFullscreen)();
    }
  }, [fullscreenItem]);

  // Detect when the user exits fullscreen through an external mechanism like
  // browser chrome or the escape key
  useFullscreenChange(
    useCallback(() => {
      if (!isFullscreen()) setFullscreenItem(null);
    }, [setFullscreenItem]),
  );

  return {
    fullscreenItem,
    toggleFullscreen,
    exitFullscreen: exitFullscreenCallback,
  };
}
