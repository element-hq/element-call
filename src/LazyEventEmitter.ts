/*
Copyright 2022 New Vector Ltd

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

import EventEmitter from "events";

type NonEmptyArray<T> = [T, ...T[]];

/**
 * An event emitter that lets events pile up in a backlog until a listener is
 * present, at which point any events that were missed are re-emitted.
 */
export class LazyEventEmitter extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private eventBacklogs = new Map<string | symbol, NonEmptyArray<any[]>>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public emit(type: string | symbol, ...args: any[]): boolean {
    const hasListeners = super.emit(type, ...args);

    if (!hasListeners) {
      // The event was missed, so add it to the backlog
      const backlog = this.eventBacklogs.get(type);
      if (backlog) {
        backlog.push(args);
      } else {
        // Start a new backlog
        this.eventBacklogs.set(type, [args]);
      }
    }

    return hasListeners;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(type: string | symbol, listener: (...args: any[]) => void): this {
    super.on(type, listener);

    const backlog = this.eventBacklogs.get(type);
    if (backlog) {
      // That was the first listener for this type, so let's send it all the
      // events that have piled up
      for (const args of backlog) super.emit(type, ...args);
      // Backlog is now clear
      this.eventBacklogs.delete(type);
    }

    return this;
  }

  public addListener(
    type: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (...args: any[]) => void
  ): this {
    return this.on(type, listener);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public once(type: string | symbol, listener: (...args: any[]) => void): this {
    super.once(type, listener);

    const backlog = this.eventBacklogs.get(type);
    if (backlog) {
      // That was the first listener for this type, so let's send it the first
      // of the events that have piled up
      super.emit(type, ...backlog[0]);
      // Clear the event from the backlog
      if (backlog.length === 1) {
        this.eventBacklogs.delete(type);
      } else {
        backlog.shift();
      }
    }

    return this;
  }
}
