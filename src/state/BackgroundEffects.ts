/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  combineLatest,
  distinctUntilChanged,
  map,
  Observable,
  scan,
} from "rxjs";
import {
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import { logger } from "matrix-js-sdk/lib/logger";
import { deepCompare } from "matrix-js-sdk/lib/utils";

import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { type BackgroundEffectsState } from "../livekit/BackgroundEffectsContext";
import {
  type BackgroundEffect,
  blurRadius,
  imagePathFor,
  parseEffect,
} from "../livekit/backgroundEffects";

export interface BackgroundEffectsOptions {
  /** Whether this browser can run a pipeline at all. */
  supported: boolean;
  /** The effect chosen, as the setting stores it. */
  effect$: Behavior<string>;
  /** The background processor pipeline to be switched between effects. */
  pipeline: BackgroundProcessorWrapper;
  /** Tells, once, that a frame carrying an effect has been drawn. */
  transformer: { onFirstFrame: (() => void) | undefined };
}

/** The background effect pipeline, as the camera tracks and the menus see it. */
export interface BackgroundEffects {
  readonly state$: Behavior<BackgroundEffectsState>;
}

/** Switches the pipeline as the choice changes, for as long as the scope lasts. */
export function createBackgroundEffects(
  scope: ObservableScope,
  { supported, effect$, pipeline, transformer }: BackgroundEffectsOptions,
): BackgroundEffects {
  const choice$ = effect$.pipe(map(parseEffect));
  const wanted$ = choice$.pipe(
    map((effect) => effect.kind !== "none"),
    distinctUntilChanged(),
  );

  const drewAFrame$ = scope.behavior(
    new Observable<boolean>((subscriber) => {
      subscriber.next(false);
      transformer.onFirstFrame = (): void => subscriber.next(true);
      return (): void => {
        transformer.onFirstFrame = undefined;
      };
    }),
  );

  const state$ = scope.behavior(
    combineLatest([wanted$, drewAFrame$]).pipe(
      scan<[boolean, boolean], BackgroundEffectsState>(
        (previous, [wanted, drewAFrame]) => {
          // Attached the first time an effect is wanted and never detached
          // after, so someone who never turns one on pays for none of it.
          const enable =
            previous.processor !== undefined || (supported && wanted);
          return {
            supported,
            processor: enable ? pipeline : undefined,
            settling: enable && !drewAFrame,
          };
        },
        { supported, processor: undefined },
      ),
    ),
  );

  const switchOptions$ = scope.behavior<
    SwitchBackgroundProcessorOptions | undefined
  >(
    combineLatest([state$, choice$]).pipe(
      map(([{ processor }, effect]) =>
        processor === undefined ? undefined : switchOptionsFor(effect),
      ),
      distinctUntilChanged(deepCompare),
    ),
  );
  // In turn: a picture's switch ends once it loads, so an earlier one could land last.
  scope.reconcile(switchOptions$, async (options) => {
    if (options === undefined) return;
    try {
      await pipeline.switchTo(options);
    } catch (e) {
      logger.warn("Failed to switch background effect", e);
    }
  });

  return { state$ };
}

function switchOptionsFor(
  effect: BackgroundEffect,
): SwitchBackgroundProcessorOptions {
  switch (effect.kind) {
    case "blur":
      return { mode: "background-blur", blurRadius };
    case "shipped": {
      const imagePath = imagePathFor(effect.id);
      return imagePath
        ? { mode: "virtual-background", imagePath }
        : { mode: "disabled" };
    }
    default:
      return { mode: "disabled" };
  }
}
