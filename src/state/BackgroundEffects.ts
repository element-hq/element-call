/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, distinctUntilChanged, map, scan } from "rxjs";
import {
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import { logger } from "matrix-js-sdk/lib/logger";
import { deepCompare } from "matrix-js-sdk/lib/utils";

import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { type BackgroundEffectsState } from "../livekit/BackgroundEffectsContext";

const blurRadius = 15;

export interface BackgroundEffectsOptions {
  /** Whether this browser can run a pipeline at all. */
  supported: boolean;
  /** Whether blur is chosen. */
  blur$: Behavior<boolean>;
  /** The background processor pipeline to be switched between effects. */
  pipeline: BackgroundProcessorWrapper;
}

/** The background effect pipeline, as the camera tracks and the menus see it. */
export interface BackgroundEffects {
  readonly state$: Behavior<BackgroundEffectsState>;
}

/** Switches the pipeline as the choice changes, for as long as the scope lasts. */
export function createBackgroundEffects(
  scope: ObservableScope,
  { supported, blur$, pipeline }: BackgroundEffectsOptions,
): BackgroundEffects {
  const state$ = scope.behavior(
    blur$.pipe(
      scan<boolean, BackgroundEffectsState>(
        (previous, wanted) => {
          // Attached the first time an effect is wanted and never detached
          // after, so someone who never turns one on pays for none of it.
          const enable =
            previous.processor !== undefined || (supported && wanted);
          return { supported, processor: enable ? pipeline : undefined };
        },
        { supported, processor: undefined },
      ),
    ),
  );

  const switchOptions$ = scope.behavior<
    SwitchBackgroundProcessorOptions | undefined
  >(
    combineLatest([state$, blur$]).pipe(
      map(([{ processor }, blur]) =>
        processor === undefined
          ? undefined
          : blur
            ? { mode: "background-blur", blurRadius }
            : { mode: "disabled" },
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
