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

import { useEffect } from "react";

import type {
  Listener,
  ListenerMap,
  TypedEventEmitter,
} from "matrix-js-sdk/src/models/typed-event-emitter";

// Shortcut for registering a listener on an EventTarget
export const useEventTarget = <T extends Event>(
  target: EventTarget | null | undefined,
  eventType: string,
  listener: (event: T) => void,
  options?: AddEventListenerOptions
) => {
  useEffect(() => {
    if (target) {
      target.addEventListener(eventType, listener as EventListener, options);
      return () =>
        target.removeEventListener(
          eventType,
          listener as EventListener,
          options
        );
    }
  }, [target, eventType, listener, options]);
};

// Shortcut for registering a listener on a TypedEventEmitter
export const useTypedEventEmitter = <
  Events extends string,
  Arguments extends ListenerMap<Events>,
  T extends Events
>(
  emitter: TypedEventEmitter<Events, Arguments>,
  eventType: T,
  listener: Listener<Events, Arguments, T>
) => {
  useEffect(() => {
    emitter.on(eventType, listener);
    return () => {
      emitter.off(eventType, listener);
    };
  }, [emitter, eventType, listener]);
};
