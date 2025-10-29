/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { LiveKitReactNativeInfo } from "livekit-client";
import { Behavior, constant } from "../Behavior";
import { LivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { ConnectionManager } from "../remoteMembers/ConnectionManager";

const ownMembership$ = (
  multiSfu: boolean,
  preferStickyEvents: boolean,
  connectionManager: ConnectionManager,
  transport: LivekitTransport,
): {
  connected: Behavior<boolean>;
  transport: Behavior<LivekitTransport | null>;
} => {
  const connection = connectionManager.registerTransports(
    constant([transport]),
  );
  const publisher = new Publisher(connection);

  /**
   * Lists the transports used by ourselves, plus all other MatrixRTC session
   * members. For completeness this also lists the preferred transport and
   * whether we are in multi-SFU mode or sticky events mode (because
   * advertisedTransport$ wants to read them at the same time, and bundling data
   * together when it might change together is what you have to do in RxJS to
   * avoid reading inconsistent state or observing too many changes.)
   */
  // TODO-MULTI-SFU find a better name for this. With the addition of sticky events it's no longer just about transports.
  // DISCUSS move to MatrixLivekitMerger
  const transport$: Behavior<{
    local: Async<LivekitTransport>;
    preferred: Async<LivekitTransport>;
    multiSfu: boolean;
    preferStickyEvents: boolean;
  } | null> = this.scope.behavior(
    this.joined$.pipe(
      switchMap((joined) =>
        joined
          ? combineLatest(
              [
                this.preferredTransport$,
                this.memberships$,
                multiSfu.value$,
                preferStickyEvents.value$,
              ],
              (preferred, memberships, preferMultiSfu, preferStickyEvents) => {
                // Multi-SFU must be implicitly enabled when using sticky events
                const multiSfu = preferStickyEvents || preferMultiSfu;

                const oldestMembership =
                  this.matrixRTCSession.getOldestMembership();
                const remote = memberships.flatMap((m) => {
                  if (m.userId === this.userId && m.deviceId === this.deviceId)
                    return [];
                  const t = m.getTransport(oldestMembership ?? m);
                  return t && isLivekitTransport(t)
                    ? [{ membership: m, transport: t }]
                    : [];
                });

                let local = preferred;
                if (!multiSfu) {
                  const oldest = this.matrixRTCSession.getOldestMembership();
                  if (oldest !== undefined) {
                    const selection = oldest.getTransport(oldest);
                    // TODO selection can be null if no transport is configured should we report an error?
                    if (selection && isLivekitTransport(selection))
                      local = ready(selection);
                  }
                }

                if (local.state === "error") {
                  this._configError$.next(
                    local.value instanceof ElementCallError
                      ? local.value
                      : new UnknownCallError(local.value),
                  );
                }

                return {
                  local,
                  remote,
                  preferred,
                  multiSfu,
                  preferStickyEvents,
                };
              },
            )
          : of(null),
      ),
    ),
  );

  return { connected: true, transport$ };
};
