/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  Observable,
  scan,
} from "rxjs";
import {
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from "@livekit/track-processors";
import { logger } from "matrix-js-sdk/lib/logger";

import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";
import { type ProcessorState } from "../livekit/TrackProcessorContext";
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
  /**
   * Shared by the pre-join preview and the call. Building or destroying it is
   * what primes it, and a primed pipeline lets its next frame through
   * untouched, so it is switched rather than rebuilt.
   */
  pipeline: BackgroundProcessorWrapper;
  /** Tells, once, that a frame carrying an effect has been drawn. */
  transformer: { onFirstFrame: (() => void) | undefined };
}

/** The background effect pipeline, as the camera tracks and the menus see it. */
export class BackgroundEffects {
  public readonly state$: Behavior<ProcessorState>;

  public constructor(
    scope: ObservableScope,
    { supported, effect$, pipeline, transformer }: BackgroundEffectsOptions,
  ) {
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

    this.state$ = scope.behavior(
      combineLatest([wanted$, drewAFrame$]).pipe(
        scan<[boolean, boolean], ProcessorState>(
          (previous, [wanted, drewAFrame]) => {
            // Attached the first time an effect is wanted and never detached
            // after, so someone who never turns one on pays for none of it.
            const attached =
              previous.processor !== undefined || (supported && wanted);
            return {
              supported,
              processor: attached ? pipeline : undefined,
              settling: attached && !drewAFrame,
            };
          },
          { supported, processor: undefined },
        ),
      ),
    );

    const switchTo = oneSwitchAtATime(pipeline);
    combineLatest([this.state$, choice$])
      .pipe(
        filter(([{ processor }]) => processor !== undefined),
        map(([, effect]) => switchOptionsFor(effect)),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
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
