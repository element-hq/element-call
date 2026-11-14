/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ClientManager, type ClientSession } from "./ClientSession";
import { type AudioOutputOptions, MediaDevices } from "./MediaDevices";
import { type ObservableScope } from "./ObservableScope";
import { createAppBackgroundEffects } from "../tracks/BackgroundEffectsContext";

/**
 * The top-level state holder for the application.
 */
export class AppViewModel {
  public readonly mediaDevices = new MediaDevices(
    this.scope,
    this.audioOutputOptions,
  );
  public readonly backgroundEffects = createAppBackgroundEffects(this.scope);

  // TODO: Move more application logic here. The CallViewModel, at the very
  // least, ought to be accessible from this object.

  /**
   * @param clientSession Where the client comes from. SPA js-sdk, EW host, widget
   */
  public constructor(
    private readonly scope: ObservableScope,
    private readonly audioOutputOptions: AudioOutputOptions,
    public readonly clientSession: ClientSession,
    /** Null where the session is a host's and not ours to manage. */
    public readonly clientManager: ClientManager | null,
  ) {}
}
