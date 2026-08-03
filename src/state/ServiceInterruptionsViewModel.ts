/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export type Service =
  | { name: "encryption-keys" }
  | { name: "reactions" }
  | { name: "screen-sharing" }
  | { name: "local-media" }
  | {
      name: "remote-media";
      /**
       * The number of users affected, for the purpose of pluralising the
       * strings.
       */
      count: number;
    };

export interface ServiceInterruptionsViewModel {
  /**
   * A non-empty array of services which are temporarily unavailable.
   */
  unavailable: Service[];
}
