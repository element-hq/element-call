/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  type Observable,
  type Subscriber,
  type Subscription,
} from "rxjs";

/**
 * A behavior that only runs its source while someone is subscribed. The source
 * is subscribed with the first subscriber and unsubscribed with the last, so a
 * value that is expensive to keep current, such as polled statistics, costs
 * nothing while nobody looks at it. `value` is whatever the source last
 * produced, or the initial value.
 */
export class LazyBehavior<T> extends BehaviorSubject<T> {
  private subscribers = 0;
  private upstream: Subscription | undefined;

  public constructor(
    private readonly source$: Observable<T>,
    initialValue: T,
  ) {
    super(initialValue);
  }

  // Every subscription of an Observable goes through this hook, which rxjs
  // declares as internal and so leaves out of its types. The base class's
  // version replays the current value and registers the subscriber; it is
  // wrapped rather than replaced.
  protected _subscribe(subscriber: Subscriber<T>): Subscription {
    if (this.subscribers++ === 0)
      this.upstream = this.source$.subscribe((value) => this.next(value));
    const subscription = (
      BehaviorSubject.prototype as unknown as {
        _subscribe(this: BehaviorSubject<T>, s: Subscriber<T>): Subscription;
      }
    )._subscribe.call(this, subscriber);
    subscription.add(() => {
      if (--this.subscribers === 0) {
        this.upstream?.unsubscribe();
        this.upstream = undefined;
      }
    });
    return subscription;
  }
}
