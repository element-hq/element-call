/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  expect,
  describe,
  it,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";
import { type MatrixRTCSession } from "matrix-js-sdk/lib/matrixrtc";

import { PosthogAnalytics } from "./PosthogAnalytics";
import {
  CallEndedTracker,
  CallReconnectingTracker,
  type CallReconnectingReason,
} from "./PosthogEvents";
import { mockConfig } from "../utils/test";

const defaultCounters = {
  roomEventEncryptionKeysSent: 10,
  roomEventEncryptionKeysReceived: 5,
};

const defaultTotals = {
  roomEventEncryptionKeysReceivedTotalAge: 500,
};

function createMockRtcSession(overrides?: {
  counters?: Partial<typeof defaultCounters>;
  totals?: Partial<typeof defaultTotals>;
}): MatrixRTCSession {
  return {
    statistics: {
      counters: { ...defaultCounters, ...overrides?.counters },
      totals: { ...defaultTotals, ...overrides?.totals },
    },
  } as unknown as MatrixRTCSession;
}

describe("CallEnded", () => {
  beforeAll(() => {
    mockConfig();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PosthogAnalytics.instance, "trackEvent").mockImplementation(
      () => {},
    );
  });

  afterAll(() => {
    PosthogAnalytics.resetInstance();
  });

  it("warns if startTime is missing when track is called", () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession();

    tracker.track("test-call-id", 2, false, mockSession);

    expect(warnSpy).toHaveBeenCalledWith(
      "[PosthogEvents] Failed to send posthog callEnded event due to missing startTime",
    );
    expect(PosthogAnalytics.instance.trackEvent).not.toHaveBeenCalled();
  });

  it("tracks event with correct properties when startTime is set", () => {
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession();

    tracker.cacheStartCall(new Date(Date.now() - 60000));
    tracker.cacheParticipantCountChanged(5);
    tracker.track("test-call-id", 3, true, mockSession);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      {
        eventName: "CallEnded",
        callId: "test-call-id",
        callParticipantsMax: 5,
        callParticipantsOnLeave: 3,
        callDuration: expect.closeTo(60, 1),
        roomEventEncryptionKeysSent: 10,
        roomEventEncryptionKeysReceived: 5,
        roomEventEncryptionKeysReceivedAverageAge: 100,
        callReconnectingCount: 0,
        callReconnectingCountSync: 0,
        callReconnectingCountMembership: 0,
        callReconnectingCountProbablyLeft: 0,
        callReconnectingCountLivekit: 0,
      },
      { send_instantly: true },
    );
  });

  it("tracks maxParticipantsCount correctly across multiple changes", () => {
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession();

    tracker.cacheStartCall(new Date());
    tracker.cacheParticipantCountChanged(3);
    tracker.cacheParticipantCountChanged(7);
    tracker.cacheParticipantCountChanged(2);
    tracker.track("test-call-id", 1, false, mockSession);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        callParticipantsMax: 7,
      }),
      expect.anything(),
    );
  });

  it("computes roomEventEncryptionKeysReceivedAverageAge as 0 when no keys received", () => {
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession({
      counters: { roomEventEncryptionKeysReceived: 0 },
    });

    tracker.cacheStartCall(new Date());
    tracker.track("test-call-id", 1, false, mockSession);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        roomEventEncryptionKeysReceivedAverageAge: 0,
      }),
      expect.anything(),
    );
  });

  it("computes roomEventEncryptionKeysReceivedAverageAge correctly when keys are received", () => {
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession({
      counters: { roomEventEncryptionKeysReceived: 4 },
      totals: { roomEventEncryptionKeysReceivedTotalAge: 200 },
    });

    tracker.cacheStartCall(new Date());
    tracker.track("test-call-id", 1, false, mockSession);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        roomEventEncryptionKeysReceivedAverageAge: 50,
      }),
      expect.anything(),
    );
  });

  it("passes send_instantly option correctly", () => {
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession();

    tracker.cacheStartCall(new Date());
    tracker.track("test-call-id", 1, false, mockSession);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      expect.anything(),
      { send_instantly: false },
    );
  });

  it("includes per-reason reconnecting counts in CallEnded", () => {
    const tracker = new CallEndedTracker();
    const mockSession = createMockRtcSession();

    tracker.cacheStartCall(new Date());
    tracker.cacheReconnecting("sync");
    tracker.cacheReconnecting("sync");
    tracker.cacheReconnecting("livekit");
    tracker.cacheReconnecting("membership");
    tracker.track("test-call-id", 1, false, mockSession);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        callReconnectingCount: 4,
        callReconnectingCountSync: 2,
        callReconnectingCountMembership: 1,
        callReconnectingCountProbablyLeft: 0,
        callReconnectingCountLivekit: 1,
      }),
      expect.anything(),
    );
  });
});

describe("CallReconnecting", () => {
  beforeAll(() => {
    mockConfig();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(PosthogAnalytics.instance, "trackEvent").mockImplementation(
      () => {},
    );
  });

  afterAll(() => {
    PosthogAnalytics.resetInstance();
  });

  it("tracks event with correct shape", () => {
    const tracker = new CallReconnectingTracker();
    tracker.track("!room:example.org", "sync", 3.5);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith({
      eventName: "CallReconnecting",
      callId: "!room:example.org",
      reason: "sync",
      reconnectDuration: 3.5,
    });
  });

  it.each([
    "sync",
    "membership",
    "probablyLeft",
    "livekit",
  ] as CallReconnectingReason[])("tracks reason %s correctly", (reason) => {
    const tracker = new CallReconnectingTracker();
    tracker.track("!room:example.org", reason, 1.0);

    expect(PosthogAnalytics.instance.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reason, reconnectDuration: 1.0 }),
    );
  });
});
