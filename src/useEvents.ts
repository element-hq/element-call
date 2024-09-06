/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useEffect } from "react";

import type {
  Listener,
  ListenerMap,
  TypedEventEmitter,
} from "matrix-js-sdk/src/models/typed-event-emitter";

// Shortcut for registering a listener on an EventTarget
export function useEventTarget<T extends Event>(
  target: EventTarget | null | undefined,
  eventType: string,
  listener: (event: T) => void,
  options?: AddEventListenerOptions,
): void {
  useEffect(() => {
    if (target) {
      target.addEventListener(eventType, listener as EventListener, options);
      return (): void =>
        target.removeEventListener(
          eventType,
          listener as EventListener,
          options,
        );
    }
  }, [target, eventType, listener, options]);
}

// Shortcut for registering a listener on a TypedEventEmitter
export function useTypedEventEmitter<
  Events extends string,
  Arguments extends ListenerMap<Events>,
  T extends Events,
>(
  emitter: TypedEventEmitter<Events, Arguments>,
  eventType: T,
  listener: Listener<Events, Arguments, T>,
): void {
  useEffect(() => {
    emitter.on(eventType, listener);
    return (): void => {
      emitter.off(eventType, listener);
    };
  }, [emitter, eventType, listener]);
}
