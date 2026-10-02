/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { calculateRetryBackoff } from "matrix-js-sdk";
import { sleep } from "matrix-js-sdk/lib/utils";

/**
 * Performs a network operation with retries on connection errors, honouring
 * the homeserver's rate limits. Rethrows once the error is not retryable or
 * the retries are used up.
 */
export async function doNetworkOperationWithRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let currentRetryCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (e) {
      currentRetryCount++;
      const backoff = calculateRetryBackoff(e, currentRetryCount, true);
      if (backoff < 0) throw e;
      await sleep(backoff);
    }
  }
}
