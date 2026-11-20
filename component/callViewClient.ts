/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentProps } from "react";
import { createClient, type MatrixClient } from "matrix-js-sdk";

import { type CallView } from "../src/room/CallView";

/**
 * The client for Element Call in Component mode.
 * We do get the full host client but we dont want to use it as it
 * might use older versions of methods were we expect changes. (f.ex. getLivekitToken)
 * We really want the expected implementation to not get runtime errors.
 *
 * This creates a new client that does use the hosts token and "stable"
 * methods but uses the ElementCall Components js-sdk's client impl for anything else.
 */
export function createCallViewClient(
  host: MatrixClient,
): ComponentProps<typeof CallView>["client"] {
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
    // The host's sync loop
    getSyncState: host.getSyncState.bind(host),
    // `on`/`off`, to listen for:
    // - `ClientEvent.Sync` (RTC slot homeserver connection)
    // - `MatrixEventEvent.Decrypted` (reactions once decrypted)
    on: host.on.bind(host),
    off: host.off.bind(host),
    // The host's store, which only its sync fills
    getUser: host.getUser.bind(host),
    // The device's crypto: there must never be a second one
    getCrypto: host.getCrypto.bind(host),
    // Reactions and raised hands: the host's crypto encrypts and decrypts them,
    // and its room gets the local echo
    sendEvent: host.sendEvent.bind(host),
    redactEvent: host.redactEvent.bind(host),
    decryptEventIfNeeded: host.decryptEventIfNeeded.bind(host),

    // Credentials, static, we can use own
    getUserId: own.getUserId.bind(own),
    getDeviceId: own.getDeviceId.bind(own),
    getDomain: own.getDomain.bind(own),
    baseUrl: own.baseUrl,
    // Requests we really want our own client version for!
    getRTCTransports: own.getRTCTransports.bind(own),
    getOpenIdToken: own.getOpenIdToken.bind(own),
    getLivekitToken: own.getLivekitToken.bind(own),
    delegateDelayedLeave: own.delegateDelayedLeave.bind(own),

    // Save requests we do not expect to change.
    setDisplayName: host.setDisplayName.bind(host),
    setAvatarUrl: host.setAvatarUrl.bind(host),
    uploadContent: host.uploadContent.bind(host),
    doesServerSupportUnstableFeature:
      host.doesServerSupportUnstableFeature.bind(host),
  };
}
