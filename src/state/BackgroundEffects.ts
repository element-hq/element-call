/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, distinctUntilChanged, filter, map, scan } from "rxjs";
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
export class BackgroundEffects {
  public readonly state$: Behavior<BackgroundEffectsState>;

  public constructor(
    scope: ObservableScope,
    { supported, blur$, pipeline }: BackgroundEffectsOptions,
  ) {
    this.state$ = scope.behavior(
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

    const switchTo = oneSwitchAtATime(pipeline);
    combineLatest([this.state$, blur$])
      .pipe(
        filter(([{ processor }]) => processor !== undefined),
        map(([, blur]): SwitchBackgroundProcessorOptions =>
          blur ? { mode: "background-blur", blurRadius } : { mode: "disabled" },
        ),
        distinctUntilChanged(deepCompare),
        scope.bind(),
      )
      .subscribe((options) => {
        switchTo(options).catch((e) =>
          logger.warn("Failed to switch background effect", e),
        );
      });
  }
}

/**
 * Switches the pipeline one choice at a time, skipping those overtaken while
 * they waited. A switch to a picture ends only once it has loaded, so a
 * slower, earlier choice would otherwise land after a later one.
 */
function oneSwitchAtATime(
  pipeline: BackgroundProcessorWrapper,
): (options: SwitchBackgroundProcessorOptions) => Promise<void> {
  let latest: SwitchBackgroundProcessorOptions | undefined;
  let queue = Promise.resolve();
  return async (options) => {
    latest = options;
    const turn = queue.then(async () => {
      if (options === latest) await pipeline.switchTo(options);
    });
    queue = turn.catch(() => {});
    return turn;
  };
}
