/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ClientEvent } from "matrix-js-sdk";
import { type ISyncStateData, type SyncState } from "matrix-js-sdk/lib/sync";
import { fromEvent, of, startWith, switchMap } from "rxjs";

import { type Behavior } from "./Behavior";
import { type ClientManager, type ClientSession } from "./ClientSession";
import { type AudioOutputOptions, MediaDevices } from "./MediaDevices";
import { type ObservableScope } from "./ObservableScope";
import { createAppBackgroundEffects$ } from "../tracks/BackgroundEffectsContext";

/**
 * The top-level state holder for the application.
 */
export class AppViewModel {
  public readonly mediaDevices = new MediaDevices(
    this.scope,
    this.audioOutputOptions,
  );
  public readonly backgroundEffects = createAppBackgroundEffects$(this.scope);

  /**
   * Whether the signed-in client's sync is failing to reach the homeserver.
   * False until its first sync, and whenever no one is signed in.
   */
  public readonly disconnected$: Behavior<boolean> = this.scope.behavior(
    this.clientSession.state$.pipe(
      switchMap((state) =>
        state.state === "signedIn"
          ? fromEvent(
              state.client,
              ClientEvent.Sync,
              (syncState: SyncState, _old: unknown, data?: ISyncStateData) =>
                syncState === "ERROR" &&
                data?.error?.name === "ConnectionError",
            ).pipe(startWith(false))
          : of(false),
      ),
    ),
  );

  // TODO: Move more application logic here. The CallViewModel, at the very
  // least, ought to be accessible from this object.

  /**
   * @param clientSession Where the client comes from. SPA js-sdk, EW host, widget.
   * @param clientManager Null where the session is a host's and not ours to manage.
   */
  public constructor(
    private readonly scope: ObservableScope,
    private readonly audioOutputOptions: AudioOutputOptions,
    public readonly clientSession: ClientSession,
    public readonly clientManager: ClientManager | null,
  ) {}
}
