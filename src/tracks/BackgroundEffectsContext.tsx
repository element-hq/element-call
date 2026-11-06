/*
Copyright 2024-2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BackgroundProcessorWrapper,
  supportsBackgroundProcessors,
} from "@livekit/track-processors";
import { createContext, type FC, type JSX, use } from "react";

import { backgroundEffect as backgroundEffectSetting } from "../settings/settings";
import {
  BackgroundEffectTransformer,
  canSegment,
} from "./BackgroundEffectTransformer";
import { addedBackgrounds } from "./backgroundImages";
import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";
import {
  type BackgroundEffects,
  type BackgroundEffectsState,
  createBackgroundEffects,
} from "../state/BackgroundEffects";
import { useBehavior } from "../useBehavior";

const BackgroundEffectsContext = createContext<BackgroundEffects | undefined>(
  undefined,
);

export function useBackgroundEffects(): BackgroundEffectsState {
  return useBehavior(useBackgroundEffectsState$());
}

export function useBackgroundEffectsState$(): Behavior<BackgroundEffectsState> {
  const effects = use(BackgroundEffectsContext);
  if (effects === undefined)
    throw new Error(
      "useBackgroundEffects must be used within a BackgroundEffectsProvider",
    );
  return effects.state$;
}

/**
 * The app's one pipeline, shared by every camera track it opens. Its builds
 * and teardowns take their turns through the SDK, which runs one operation
 * at a time on a processor.
 */
export function createAppBackgroundEffects(
  scope: ObservableScope,
): BackgroundEffects {
  const transformer = new BackgroundEffectTransformer({
    backgroundDisabled: true,
  });
  return createBackgroundEffects(scope, {
    supported: supportsBackgroundProcessors(),
    effect$: backgroundEffectSetting.value$,
    setEffect: backgroundEffectSetting.setValue,
    added$: addedBackgrounds.added$,
    canSegment,
    pipeline: new BackgroundProcessorWrapper(transformer, "background-effect"),
    transformer,
  });
}

interface Props {
  effects: BackgroundEffects;
  children: JSX.Element;
}

export const BackgroundEffectsProvider: FC<Props> = ({ effects, children }) => (
  <BackgroundEffectsContext value={effects}>
    {children}
  </BackgroundEffectsContext>
);
