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

import { useCallback, useRef, useState } from "react";

import { useEventTarget } from "./useEvents";

/**
 * @returns Whether the user has requested reduced motion.
 */
export const usePrefersReducedMotion = () => {
  const mediaQuery = useRef<MediaQueryList>();
  if (mediaQuery.current === undefined)
    mediaQuery.current = matchMedia("(prefers-reduced-motion)");

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    mediaQuery.current.matches
  );
  useEventTarget(
    mediaQuery.current!,
    "change",
    useCallback(
      () => setPrefersReducedMotion(mediaQuery.current!.matches),
      [setPrefersReducedMotion]
    )
  );

  return prefersReducedMotion;
};
