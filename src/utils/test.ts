/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/
import { map } from "rxjs";
import { RunHelpers, TestScheduler } from "rxjs/testing";
import { expect, vi } from "vitest";

export function withFakeTimers(continuation: () => void): void {
  vi.useFakeTimers();
  try {
    continuation();
  } finally {
    vi.useRealTimers();
  }
}

export interface OurRunHelpers extends RunHelpers {
  /**
   * Schedules a sequence of actions to happen, as described by a marble
   * diagram.
   */
  schedule: (marbles: string, actions: Record<string, () => void>) => void;
}

/**
 * Run Observables with a scheduler that virtualizes time, for testing purposes.
 */
export function withTestScheduler(
  continuation: (helpers: OurRunHelpers) => void,
): void {
  new TestScheduler((actual, expected) => {
    expect(actual).deep.equals(expected);
  }).run((helpers) =>
    continuation({
      ...helpers,
      schedule(marbles, actions) {
        const actionsObservable = helpers
          .cold(marbles)
          .pipe(map((value) => actions[value]()));
        const results = Object.fromEntries(
          Object.keys(actions).map((value) => [value, undefined] as const),
        );
        // Run the actions and verify that none of them error
        helpers.expectObservable(actionsObservable).toBe(marbles, results);
      },
    }),
  );
}
