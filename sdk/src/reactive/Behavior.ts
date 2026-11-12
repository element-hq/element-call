/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

/**
 * A stateful, read-only reactive value. As an Observable, it is "hot" and
 * always replays the current value upon subscription.
 *
 * A Behavior is to BehaviorSubject what Observable is to Subject; it does not
 * provide a way to imperatively set new values. For more info on the
 * distinction between Behaviors and Observables, see
 * https://monoid.dk/post/behaviors-and-streams-why-both/.
 */
export type Behavior<T> = Omit<
  BehaviorSubject<T>,
  "next" | "observers" | "error"
>;

/**
 * Creates a Behavior which never changes in value.
 */
export function constant<T>(value: T): Behavior<T> {
  return new BehaviorSubject(value);
}
