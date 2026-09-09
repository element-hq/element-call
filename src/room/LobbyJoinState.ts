/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How the local user may enter the call they are looking at, and therefore what
 * the lobby offers them. Everything the lobby needs to know about membership.
 */
export type LobbyJoinState =
  /**
   * The user may enter the call right away. `notice` is set when they got here
   * by having a request accepted, but the join it entitles them to failed.
   */
  | { kind: "can-join"; join: () => void; notice?: "request_accepted" }
  /**
   * The room only takes knocks. `error` is set when a previous request failed
   * to send.
   */
  | {
      kind: "can-ask-to-join";
      askToJoin: (reason?: string) => void;
      error?: "request_failed";
    }
  /** The request is on its way to the server. */
  | { kind: "sending-request" }
  /** The user's join is on its way. */
  | { kind: "joining" }
  /**
   * The request is with the room's moderators. `cancelRequest` is absent while
   * a withdrawal is on its way, and where withdrawing is not supported.
   */
  | { kind: "waiting-for-approval"; cancelRequest?: () => void }
  /** The request was declined. There is no way to ask again. */
  | { kind: "denied" }
  | { kind: "banned"; reason?: string }
  /** The room takes neither joins nor knocks from this user. */
  | { kind: "not-allowed" };
