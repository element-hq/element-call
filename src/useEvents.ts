/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type {
  Listener,
  ListenerMap,
  TypedEventEmitter,
} from "matrix-js-sdk/lib/models/typed-event-emitter";

/**
 * Shortcut for registering a listener on an EventTarget.
 */
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

/**
 * Shortcut for registering a listener on a TypedEventEmitter.
 */
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

/**
 * Reactively tracks a value which is recalculated whenever the provided event
 * emitter emits an event. This is useful for bridging state from matrix-js-sdk
 * into React.
 */
export function useTypedEventEmitterState<
  Events extends string,
  Arguments extends ListenerMap<Events>,
  T extends Events,
  State,
>(
  emitter: TypedEventEmitter<Events, Arguments>,
  eventType: T,
  getState: () => State,
): State {
  const subscribe = useCallback(
    (onChange: () => void) => {
      emitter.on(eventType, onChange as Listener<Events, Arguments, T>);
      return (): void => {
        emitter.off(eventType, onChange as Listener<Events, Arguments, T>);
      };
    },
    [emitter, eventType],
  );
  // See the React docs for useSyncExternalStore; given that we're trying to
  // bridge state from an external source into React, using this hook is exactly
  // what React recommends.
  return useSyncExternalStore(subscribe, getState);
}
