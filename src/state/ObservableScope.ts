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

import { MonoTypeOperatorFunction, Subject, takeUntil } from "rxjs";

/**
 * A scope which limits the execution lifetime of its bound Observables.
 */
export class ObservableScope {
  private readonly ended = new Subject<void>();

  /**
   * Binds an Observable to this scope, so that it completes when the scope
   * ends.
   */
  public bind<T>(): MonoTypeOperatorFunction<T> {
    return takeUntil(this.ended);
  }

  /**
   * Ends the scope, causing any bound Observables to complete.
   */
  public end(): void {
    this.ended.next();
    this.ended.complete();
  }
}
