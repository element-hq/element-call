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

import { useState, useRef, useCallback } from "react";

// Like useState, except state updates can be enqueued with a configurable delay
export const useDelayedState = <T>(
  initial?: T
): [T, (value: T, delay: number) => void, (value: T) => void] => {
  const [state, setState] = useState<T>(initial);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>();
  if (!timers.current) timers.current = new Set();

  const setStateDelayed = useCallback(
    (value: T, delay: number) => {
      const timer = setTimeout(() => {
        setState(value);
        timers.current.delete(timer);
      }, delay);
      timers.current.add(timer);
    },
    [setState, timers]
  );
  const setStateImmediate = useCallback(
    (value: T) => {
      // Clear all updates currently in the queue
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();

      setState(value);
    },
    [setState, timers]
  );

  return [state, setStateDelayed, setStateImmediate];
};
