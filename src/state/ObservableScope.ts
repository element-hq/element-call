/*
Copyright 2024 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {
  distinctUntilChanged,
  Observable,
  shareReplay,
  Subject,
  takeUntil,
} from "rxjs";

type MonoTypeOperator = <T>(o: Observable<T>) => Observable<T>;

/**
 * A scope which limits the execution lifetime of its bound Observables.
 */
export class ObservableScope {
  private readonly ended = new Subject<void>();

  private readonly bindImpl: MonoTypeOperator = takeUntil(this.ended);

  /**
   * Binds an Observable to this scope, so that it completes when the scope
   * ends.
   */
  public bind(): MonoTypeOperator {
    return this.bindImpl;
  }

  private readonly stateImpl: MonoTypeOperator = (o) =>
    o.pipe(this.bind(), distinctUntilChanged(), shareReplay(1));

  /**
   * Transforms an Observable into a hot state Observable which replays its
   * latest value upon subscription, skips updates with identical values, and
   * is bound to this scope.
   */
  public state(): MonoTypeOperator {
    return this.stateImpl;
  }

  /**
   * Ends the scope, causing any bound Observables to complete.
   */
  public end(): void {
    this.ended.next();
    this.ended.complete();
  }
}
