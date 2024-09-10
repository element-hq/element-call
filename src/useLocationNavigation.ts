/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
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
