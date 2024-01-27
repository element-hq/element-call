/*
Copyright 2023 New Vector Ltd

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

import { Subject } from "rxjs";

/**
 * An MVVM view model.
 */
export abstract class ViewModel {
  protected readonly destroyed = new Subject<void>();

  /**
   * Instructs the ViewModel to clean up its resources. If you forget to call
   * this, there may be memory leaks!
   */
  public destroy(): void {
    this.destroyed.next();
    this.destroyed.complete();
  }
}
