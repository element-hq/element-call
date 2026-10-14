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
 * @param operation The operation to perform.
 * @param shouldRetry Rules out errors that retrying cannot fix, on top of the
 *   standard backoff rule. Retries everything by default.
 */
export async function doNetworkOperationWithRetry<T>(
  operation: () => Promise<T>,
  shouldRetry: (e: unknown) => boolean = () => true,
): Promise<T> {
  let currentRetryCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (e) {
      currentRetryCount++;
      const backoff = shouldRetry(e)
        ? calculateRetryBackoff(e, currentRetryCount, true)
        : -1;
      if (backoff < 0) throw e;
      await sleep(backoff);
    }
  }
}
