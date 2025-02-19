/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import {
  type Observable,
  audit,
  merge,
  timer,
  filter,
  startWith,
  distinctUntilChanged,
} from "rxjs";

/**
 * Require 1 second of continuous speaking to become a speaker, and 60 second of
 * continuous silence to stop being considered a speaker
 */
export function observeSpeaker$(
  isSpeakingObservable$: Observable<boolean>,
): Observable<boolean> {
  const distinct$ = isSpeakingObservable$.pipe(distinctUntilChanged());

  return distinct$.pipe(
    // Either change to the new value after the timer or re-emit the same value if it toggles back
    // (audit will return the latest (toggled back) value) before the timeout.
    audit((s) =>
      merge(timer(s ? 1000 : 60000), distinct$.pipe(filter((s1) => s1 !== s))),
    ),
    // Filter the re-emissions (marked as: | ) that happen if we toggle quickly (<1s) from false->true->false|->..
    startWith(false),
    distinctUntilChanged(),
  );
}
