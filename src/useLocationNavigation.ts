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
import { useHistory } from "react-router-dom";

export function useLocationNavigation(enabled = false): void {
  const history = useHistory();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    let unblock = undefined;

    if (enabled) {
      unblock = history.block((tx) => {
        const url = new URL(tx.pathname, window.location.href);
        url.search = tx.search;
        url.hash = tx.hash;
        window.location.href = url.href;
      });
    }

    return (): void => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (unblock) {
        unblock();
      }
    };
  }, [history, enabled]);
}
