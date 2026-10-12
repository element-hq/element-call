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
  type EffectId,
  imagePathFor,
  parseEffect,
} from "../livekit/backgroundEffects";
import { type AddedBackground } from "../livekit/backgroundImages";

export interface BackgroundEffectsOptions {
  /** Whether this browser can run a pipeline at all. */
  supported: boolean;
  /** The effect chosen, as the setting stores it. */
  effect$: Behavior<string>;
  /** Stores a choice, to forget one that can't be honoured. */
  setEffect: (id: EffectId) => void;
  /** The backgrounds the device keeps, undefined until it has said. */
  added$: Behavior<AddedBackground[] | undefined>;
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
  {
    supported,
    effect$,
    setEffect,
    added$,
    pipeline,
    transformer,
  }: BackgroundEffectsOptions,
): BackgroundEffects {
  const choice$ = effect$.pipe(map(parseEffect));
  const wanted$ = choice$.pipe(
    map((effect) => effect.kind !== "none"),
    distinctUntilChanged(),
  );

  combineLatest([choice$, added$])
    .pipe(scope.bind())
    .subscribe(([effect, added]) => {
      if (effect.kind === "none") return;
      if (
        !supported ||
        (effect.kind === "added" &&
          added !== undefined &&
          !added.some(({ id }) => id === effect.id))
      )
        setEffect("none");
    });

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
    combineLatest([state$, choice$, added$]).pipe(
      map(([{ processor }, effect, added]) =>
        processor === undefined
          ? undefined
          : switchOptionsFor(
              effect,
              effect.kind === "added"
                ? added?.find(({ id }) => id === effect.id)?.url
                : undefined,
            ),
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

/** `addedUrl` is the picture of the added background chosen, if still kept. */
function switchOptionsFor(
  effect: BackgroundEffect,
  addedUrl: string | undefined,
): SwitchBackgroundProcessorOptions {
  const withImage = (
    imagePath: string | undefined,
  ): SwitchBackgroundProcessorOptions =>
    imagePath
      ? { mode: "virtual-background", imagePath }
      : { mode: "disabled" };
  switch (effect.kind) {
    case "blur":
      return { mode: "background-blur", blurRadius };
    case "shipped":
      return withImage(imagePathFor(effect.id));
    case "added":
      return withImage(addedUrl);
    default:
      return { mode: "disabled" };
  }
}
