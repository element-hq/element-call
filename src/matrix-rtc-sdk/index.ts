/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The MatrixRTC SDK: the Rust `matrix-rtc` crate through its uniffi web
 * bindings, shipped as the `@element-hq/matrix-rtc` npm package. Everything
 * Element Call needs to *participate* in a MatrixRTC session — the session
 * projection, our own membership with its keep-alive, transport tokens and
 * the media key exchange — lives in the crate; this module loads it and
 * re-exports the surface Element Call uses.
 *
 * Nothing else imports the package directly: the boot below is the one place
 * the wasm is loaded and the crate's logging is wired up, so a caller cannot
 * end up with a silent or half-initialised SDK.
 */

import { initAsync, type WasmSource } from "@element-hq/matrix-rtc";
import { installMatrixRtcLogSink } from "./logSink";

export {
  FfiMatrixDriver,
  FfiParticipationManager,
  FfiElementCallCompat,
  FfiEventOrigin,
  FfiStatus,
  FfiDelegationRoute,
  FfiDeviceAttribution,
  FfiDisconnectCause,
  FfiImpairment,
  FfiJoinError,
  FfiKeepAlive,
  FfiLogLevel,
  setLogSink,
  FfiMembershipState,
  FfiTransportIntent,
  RtcError,
  computeSessionsFromEvents,
} from "@element-hq/matrix-rtc";
export type {
  FfiConnectionData,
  FfiConnectionWithMembers,
  FfiHomeserverDelegationRequest,
  FfiJoinParams,
  FfiLivekitToken,
  FfiLivekitTokenRequest,
  FfiMediaKey,
  FfiMember,
  FfiMembership,
  FfiParticipationConfig,
  FfiRtcTransport,
  FfiSendEventResponse,
  FfiSessionSnapshot,
  FfiToDeviceDelivery,
  FfiToDeviceRecipient,
  FfiTransportDelegationRequest,
  ConnectivitySinkLike,
  LogSink,
  MatrixDriverCallback,
  RoomEventSinkLike,
  StateUpdateSinkLike,
  ToDeviceSinkLike,
} from "@element-hq/matrix-rtc";

/**
 * Where to load the wasm from. A URL (or anything `fetch` accepts) in a
 * browser; bytes or a compiled module where there is nothing to fetch from,
 * such as tests.
 */
export type MatrixRtcWasmSource = WasmSource;

let loading: Promise<void> | null = null;

/**
 * Loads and initialises the SDK. Idempotent: the first call decides the
 * source, later calls await the same load.
 *
 * Without a `source`, the wasm is the package's own copy as the bundler
 * placed it (an asset URL in the app builds). A host that serves the file
 * from somewhere else, or a test runner with no server, passes its own.
 */
export async function initMatrixRtcSdk(
  source?: MatrixRtcWasmSource,
): Promise<void> {
  loading ??= (async (): Promise<void> => {
    await initAsync(source ?? (await bundledWasm()));
    // The crate is silent until told where to log.
    installMatrixRtcLogSink();
  })();
  await loading;
}

/**
 * The wasm as the bundler placed it, resolved lazily so nothing is fetched
 * until needed. Asked for explicitly, rather than leaving the package to its
 * `import.meta.url` default, so that the dev server's dependency
 * pre-bundling, which rewrites module URLs, cannot lose track of it.
 *
 * `no-inline` because the library build would otherwise embed the wasm as a
 * base64 `data:` URL: a megabyte in the JavaScript, and one a host's Content
 * Security Policy may well refuse to `fetch` (Element Web's does). As a file
 * next to the bundle, referenced through `import.meta.url`, the host's own
 * bundler copies it along with everything else.
 */
async function bundledWasm(): Promise<string> {
  const { default: url } =
    await import("@element-hq/matrix-rtc/wasm?url&no-inline");
  return url;
}
