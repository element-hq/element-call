/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createClient, type MatrixClient } from "matrix-js-sdk";
import type { createCallMatrixBackend } from "../src/CallMatrixBackend";
import { adoptingHostErrors } from "./hostErrors";

/**
 * Everything the component calls on the host's client. Part of the public
 * `client` prop (see api.ts), so that a host whose js-sdk lacks one of these
 * fails to type-check.
 *
 * STOP GAP until the host passes an interface of our own instead of its
 * `MatrixClient`.
 */
export type HostClientPart = Pick<
  MatrixClient,
  | "baseUrl"
  | "getUserId"
  | "getDeviceId"
  | "getAccessToken"
  | "getSyncState"
  | "on"
  | "off"
  | "getUser"
  | "getCrypto"
  | "sendEvent"
  | "redactEvent"
  | "decryptEventIfNeeded"
  | "_unstable_sendStickyEvent"
  | "_unstable_sendStickyDelayedEvent"
  | "encryptAndSendToDevice"
  | "sendStateEvent"
  | "setDisplayName"
  | "setAvatarUrl"
  | "uploadContent"
  | "doesServerSupportUnstableFeature"
>;

/**
 * The client for Element Call in Component mode.
 * We do get the full host client but we dont want to use it as it
 * might use older versions of methods were we expect changes. (f.ex. getLivekitToken)
 * We really want the expected implementation to not get runtime errors.
 *
 * This creates a new client that does use the hosts token and "stable"
 * methods but uses the ElementCall Components js-sdk's client impl for anything else.
 */
export function createComponentLocalJsClient(
  host: HostClientPart,
): Parameters<typeof createCallMatrixBackend>[0] {
  const own = createClient({
    baseUrl: host.baseUrl,
    userId: host.getUserId() ?? undefined,
    deviceId: host.getDeviceId() ?? undefined,
    accessToken: host.getAccessToken() ?? undefined,
    // The host refreshes its token without telling us, so each request takes
    // whichever token the host holds now
    fetchFn: async (input, init) => {
      const headers = new Headers(init?.headers);
      const token = host.getAccessToken();
      if (token !== null) headers.set("Authorization", `Bearer ${token}`);
      return globalThis.fetch(input, { ...init, headers });
    },
  });

  return {
    // Own has no sync loop: `syncApi?.getSyncState() ?? null` is always null
    getSyncState: host.getSyncState.bind(host),
    // Only the syncing host emits `Sync`, `ToDeviceEvent` and `Decrypted`
    on: host.on.bind(host),
    // The same emitter as `on`
    off: host.off.bind(host),
    // `this.store.getUser`: own's store is empty, only the host's sync fills it
    getUser: host.getUser.bind(host),
    // Own never inits crypto, and a second one on the device would corrupt it
    getCrypto: host.getCrypto.bind(host),
    // Every one of the host's methods that can fail rejects with our error
    // classes, which ours can recognise (see hostErrors.ts)

    // Own has no rooms: `encryptEventIfNeeded`'s `if (!room) return` skips E2EE
    sendEvent: adoptingHostErrors(host.sendEvent.bind(host)),
    // Not encrypted, but the local echo goes to `getRoom()`: only the host's
    redactEvent: adoptingHostErrors(host.redactEvent.bind(host)),
    // `attemptDecryption` only runs `if (this.getCrypto())`: a no-op on own
    decryptEventIfNeeded: adoptingHostErrors(
      host.decryptEventIfNeeded.bind(host),
    ),
    // Like `sendEvent`: on own, `if (!room) return` sends it in plaintext
    _unstable_sendStickyEvent: adoptingHostErrors(
      host._unstable_sendStickyEvent.bind(host),
    ),
    // Like `sendEvent`: delayed, but still `encryptEventIfNeeded(event, room)`
    _unstable_sendStickyDelayedEvent: adoptingHostErrors(
      host._unstable_sendStickyDelayedEvent.bind(host),
    ),
    // `if (!this.cryptoBackend) throw`: own has no crypto
    encryptAndSendToDevice: adoptingHostErrors(
      host.encryptAndSendToDevice.bind(host),
    ),

    // Static: own was created with the host's user id
    getUserId: own.getUserId.bind(own),
    // Static: own was created with the host's device id
    getDeviceId: own.getDeviceId.bind(own),
    // Static: derived from the user id
    getDomain: own.getDomain.bind(own),
    // Static: own was created with the host's base URL
    baseUrl: own.baseUrl,
    // MSC4143 stable or unstable prefix, picked by /versions: ours knows both
    getRTCTransports: own.getRTCTransports.bind(own),
    // Plain HTTP with the copied credentials, like the other LiveKit auth
    getOpenIdToken: own.getOpenIdToken.bind(own),
    // MSC4195 stable or `io.element.msc4195` prefix: an older host may lack it
    getLivekitToken: own.getLivekitToken.bind(own),
    // MSC4195, like `getLivekitToken`: an older host may lack it
    delegateDelayedLeave: own.delegateDelayedLeave.bind(own),
    // Plain HTTP into own's cache, which `getCachedCapabilities` reads
    fetchCapabilities: own.fetchCapabilities.bind(own),
    // Has to be the client whose cache `fetchCapabilities` filled
    getCachedCapabilities: own.getCachedCapabilities.bind(own),
    // Straight to `scheduleDelayedEvent`: no room, no crypto, plain HTTP
    _unstable_sendDelayedStateEvent:
      own._unstable_sendDelayedStateEvent.bind(own),
    // Plain POST `/delayed_events/{id}/cancel`; newer API an old host may lack
    _unstable_cancelScheduledDelayedEvent:
      own._unstable_cancelScheduledDelayedEvent.bind(own),
    // Plain POST by the server's delay id: restarts the host's sticky leave too
    _unstable_restartScheduledDelayedEvent:
      own._unstable_restartScheduledDelayedEvent.bind(own),
    // Plain POST `/delayed_events/{id}/send`; newer API an old host may lack
    _unstable_sendScheduledDelayedEvent:
      own._unstable_sendScheduledDelayedEvent.bind(own),

    // Plain HTTP, either client works; a stable API, so the host's
    sendStateEvent: adoptingHostErrors(host.sendStateEvent.bind(host)),
    // Updates the `User` in the host's store, which `useProfile` listens to
    setDisplayName: adoptingHostErrors(host.setDisplayName.bind(host)),
    // Like `setDisplayName`: updates the `User` in the host's store
    setAvatarUrl: adoptingHostErrors(host.setAvatarUrl.bind(host)),
    // Plain HTTP, either client works; a stable API, so the host's
    uploadContent: adoptingHostErrors(host.uploadContent.bind(host)),
    // Reads the host's /versions, which it has already fetched
    doesServerSupportUnstableFeature: adoptingHostErrors(
      host.doesServerSupportUnstableFeature.bind(host),
    ),
  };
}
