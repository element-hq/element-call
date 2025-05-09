/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export class Cancellable {
  public constructor(private cancelled = false) {}

  public cancel(): void {
    this.cancelled = true;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }
}
