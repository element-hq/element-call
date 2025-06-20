/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { MediaDevices } from "./MediaDevices";
import { ViewModel } from "./ViewModel";

/**
 * The top-level state holder for the application.
 */
export class AppViewModel extends ViewModel {
  public readonly mediaDevices = new MediaDevices(this.scope);

  // TODO: Move more application logic here. The CallViewModel, at the very
  // least, ought to be accessible from this object.
}
