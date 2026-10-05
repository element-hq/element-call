/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * EXPERIMENTAL
 *
 * MatrixRTC sessions with LiveKit media, without Element Call's UI: the call
 * model Element Call's own view model is built on, for hosts that want to
 * build a different one. The design is in `SdkArchitecture.md` next to this
 * file.
 */

export { type Behavior, constant } from "./src/reactive/Behavior";
export {
  Epoch,
  mapEpoch,
  ObservableScope,
  trackEpoch,
} from "./src/reactive/ObservableScope";
export {
  filterBehavior,
  finalizeValue,
  generateItems,
  generateItemsWithEpoch,
  pauseWhen,
} from "./src/reactive/observable";
export { E2eeType, type EncryptionSystem } from "./src/encryption";
export {
  defaultMediaQuality,
  defaultSessionTimings,
  type DelayedLeaveTimings,
  MatrixRTCMode,
  type MediaQuality,
  type SessionTimings,
} from "./src/config";
export {
  ErrorCategory,
  ErrorCode,
  FailToGetOpenIdToken,
  FailToStartLivekitConnection,
  InsufficientCapacityError,
  LivekitConnectionError,
  MatrixRTCTransportMissingError,
  MembershipManagerError,
  NoMatrix2AuthorizationService,
  PeerConnectionTimeoutError,
  SFURoomCreationRestrictedError,
  UnknownRTCError,
} from "./src/errors";

export * from "./src/api";
export * from "./src/media-api";
export * from "./src/media-backend/api";
export { trackBySource$, type TrackOfSource } from "./src/utils/tracks";
export { createMatrixRTCClient } from "./src/MatrixRTCClient";
export {
  createLivekitBackend,
  type LivekitBackendOptions,
} from "./src/media-backend/livekit/LivekitBackend";
// For a developer panel to check a transport url before using it
export {
  getSFUConfigWithOpenID as authenticateWithTransport,
  type TokenEndpoint,
} from "./src/media-backend/livekit/openIDSFU";
