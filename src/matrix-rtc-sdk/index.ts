/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The MatrixRTC SDK: the Rust `matrix-rtc` crate through its uniffi web
 * bindings. Everything Element Call needs to *participate* in a MatrixRTC
 * session — the session projection, our own membership with its keep-alive,
 * transport tokens and the media key exchange — lives in the crate; this
 * module loads it and re-exports the surface Element Call uses.
 *
 * The bindings under `generated/` are vendored by
 * `scripts/sync-matrix-rtc-sdk.sh` and never edited by hand.
 */

import initAsync, { type InitInput } from "./generated/wasm-bindgen/index.js";
import bindings from "./generated/matrix_rtc";

export {
  FfiMatrixDriver,
  FfiParticipationManager,
  FfiElementCallCompat,
  FfiEventOrigin,
  FfiStatus,
  FfiDisconnectCause,
  FfiJoinError,
  FfiKeepAlive,
  FfiMembershipState,
  FfiTransportIntent,
  RtcError,
  computeSessionsFromEvents,
} from "./generated/matrix_rtc";
export type {
  FfiConnectionData,
  FfiConnectionWithMembers,
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
  ConnectivitySinkLike,
  MatrixDriverCallback,
  RoomEventSinkLike,
  StateUpdateSinkLike,
  ToDeviceSinkLike,
} from "./generated/matrix_rtc";

/**
 * Where to load the wasm from. A URL (or anything `fetch` accepts) in a
 * browser; bytes or a compiled module where there is nothing to fetch from,
 * such as tests.
 */
export type MatrixRtcWasmSource = InitInput;

let loading: Promise<void> | null = null;

/**
 * Loads and initialises the SDK. Idempotent: the first call decides the
 * source, later calls await the same load.
 *
 * Without a `source`, the wasm is the one bundled next to this module (an
 * asset URL in the app builds). A host that serves the file from somewhere
 * else, or a test runner with no server, passes its own.
 */
export async function initMatrixRtcSdk(
  source?: MatrixRtcWasmSource,
): Promise<void> {
  loading ??= (async (): Promise<void> => {
    await initAsync({ module_or_path: source ?? (await bundledWasm()) });
    bindings.initialize();
  })();
  await loading;
}

/** The wasm as the bundler placed it, resolved lazily so nothing is fetched until needed. */
async function bundledWasm(): Promise<string> {
  const { default: url } =
    await import("./generated/wasm-bindgen/index_bg.wasm?url");
  return url;
}
