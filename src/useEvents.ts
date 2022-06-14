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

// Shortcut for registering a listener on an EventTarget
export const useEventTarget = <T extends Event>(
  target: EventTarget,
  eventType: string,
  listener: (event: T) => void,
  options?: AddEventListenerOptions
) => {
  useEffect(() => {
    if (target) {
      target.addEventListener(eventType, listener, options);
      return () => target.removeEventListener(eventType, listener, options);
    }
  }, [target, eventType, listener, options]);
};

// TODO: Have a similar hook for EventEmitters
