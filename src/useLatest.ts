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

import { useRef } from "react"

/**
 * Returns a ref that always holds the latest value passed to this hook.
 */
export const useLatest = <T,>(t: T): { current: T } => {
  const latest = useRef(t)
  latest.current = t
  return latest
}
