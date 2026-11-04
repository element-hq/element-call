/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type VideoProcessor } from "../media-api";

const turns = new WeakMap<VideoProcessor, Promise<unknown>>();

/**
 * One operation at a time on a processor. A host shares one across the
 * tracks it captures and publishes, and a second init while the first still
 * loads its model, or a destroy while an init runs, leaves it broken: the
 * backend's own locking is per track, and a track that is stopped tears its
 * processor down without waiting.
 */
export async function inTurn<T>(
  processor: VideoProcessor,
  run: () => Promise<T>,
): Promise<T> {
  const turn = (turns.get(processor) ?? Promise.resolve()).then(run, run);
  turns.set(processor, turn);
  return turn;
}
