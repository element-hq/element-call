/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type UnstableLivekitTransport,
  type MatrixRTCSession,
  type Transport,
} from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, type Mock, vi } from "vitest";

import { defaultSessionTimings, MatrixRTCMode } from "../config";
import { ownMemberMock } from "../utils/test";
import { joinJsSdkSession } from "./joinJsSdkSession";

const transport: UnstableLivekitTransport = {
  type: "livekit",
  livekit_service_url: "https://lk.example.org",
};

const transportWithAlias: Transport = {
  livekit_alias: "!room:example.org",
  ...transport,
};

/** A session that only records the join; nothing else of it is touched. */
function session(): MatrixRTCSession & {
  join: Mock<MatrixRTCSession["join"]>;
} {
  return { join: vi.fn() } as unknown as MatrixRTCSession & {
    join: Mock<MatrixRTCSession["join"]>;
  };
}

describe("joinJsSdkSession", () => {
  it("joins with the identity, the transport and the delayed leave timings it was given", () => {
    const s = session();
    const timings = {
      ...defaultSessionTimings,
      waitForKeyRotationMs: 500,
      membershipEventExpiryMs: 60_000,
      keyRotationParticipantLimit: 20,
    };

    joinJsSdkSession("!room:example.org", s, ownMemberMock, transport, {
      encryptMedia: true,
      matrixRTCMode: MatrixRTCMode.Compatibility,
      sendNotificationType: "ring",
      timings,
      delayedLeave: {
        delay_ms: 3_600_000,
        restart_ms: 300_000,
        restart_timeout_ms: 5_000,
      },
    });

    expect(s.join).toHaveBeenCalledWith(ownMemberMock, [transportWithAlias], {
      notificationType: "ring",
      callIntent: undefined,
      applicationData: {},
      manageMediaKeys: true,
      delayedLeaveEventRestartMs: 300_000,
      delayedLeaveEventDelayMs: 3_600_000,
      delayedLeaveEventRestartLocalTimeoutMs: 5_000,
      networkErrorRetryMs: 1_000,
      makeKeyDelay: 500,
      membershipEventExpiryMs: 60_000,
      keyRotationParticipantLimit: 20,
      unstableSendStickyEvents: false,
      // The sync grace period is the shorter wait: 10 s at 1 s per retry, plus one
      maximumNetworkErrorRetryCount: 11,
    });
  });

  it("gives up on the network once the delayed leave has probably been sent", () => {
    const s = session();

    joinJsSdkSession("!room:example.org", s, ownMemberMock, transport, {
      encryptMedia: false,
      matrixRTCMode: MatrixRTCMode.Compatibility,
      timings: { ...defaultSessionTimings, networkErrorRetryMs: 4_000 },
      delayedLeave: { delay_ms: 18_000 },
    });

    expect(s.join).toHaveBeenCalledWith(
      ownMemberMock,
      [transportWithAlias],
      expect.objectContaining({
        manageMediaKeys: false,
        maximumNetworkErrorRetryCount: 4,
      }),
    );
  });

  it("lifts the call intent out of the application data and sends sticky events in Matrix 2.0 mode", () => {
    const s = session();

    joinJsSdkSession("!room:example.org", s, ownMemberMock, transport, {
      encryptMedia: true,
      matrixRTCMode: MatrixRTCMode.Matrix_2_0,
      applicationData: { "m.call.intent": "audio", custom: 1 },
      timings: defaultSessionTimings,
      delayedLeave: defaultSessionTimings.delayedLeave,
    });

    expect(s.join).toHaveBeenCalledWith(
      ownMemberMock,
      [transportWithAlias],
      expect.objectContaining({
        callIntent: "audio",
        applicationData: { custom: 1 },
        unstableSendStickyEvents: true,
      }),
    );
  });
});
