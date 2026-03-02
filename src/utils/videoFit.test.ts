/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test, vi } from "vitest";
import {
  LocalTrack,
  type LocalTrackPublication,
  type RemoteTrackPublication,
  Track,
} from "livekit-client";

import { ObservableScope } from "../state/ObservableScope";
import { videoFit$, videoSizeFromParticipant$ } from "./videoFit";
import { constant } from "../state/Behavior";
import {
  flushPromises,
  mockLocalParticipant,
  mockRemoteParticipant,
} from "./test";

describe("videoFit$ defaults", () => {
  test.each([
    {
      videoSize: { width: 1920, height: 1080 },
      tileSize: undefined,
    },
    {
      videoSize: { width: 1080, height: 1920 },
      tileSize: undefined,
    },
    {
      videoSize: undefined,
      tileSize: { width: 1920, height: 1080 },
    },
    {
      videoSize: undefined,
      tileSize: { width: 1080, height: 1920 },
    },
  ])(
    "videoFit$ returns `cover` when videoSize is $videoSize and tileSize is $tileSize",
    ({ videoSize, tileSize }) => {
      const scope = new ObservableScope();
      const videoSize$ = constant(videoSize);
      const tileSize$ = constant(tileSize);

      const fit = videoFit$(scope, videoSize$, tileSize$);
      expect(fit.value).toBe("cover");
    },
  );
});

const VIDEO_480_L = { width: 640, height: 480 };
const VIDEO_720_L = { width: 1280, height: 720 };
const VIDEO_1080_L = { width: 1920, height: 1080 };

// Some sizes from real world testing, which don't match the standard video sizes exactly
const TILE_SIZE_1_L = { width: 180, height: 135 };
const TILE_SIZE_3_P = { width: 379, height: 542 };
const TILE_SIZE_4_L = { width: 957, height: 542 };
// This is the size of an iPhone Xr in portrait mode
const TILE_SIZE_5_P = { width: 414, height: 896 };

export function invertSize(size: { width: number; height: number }): {
  width: number;
  height: number;
} {
  return {
    width: size.height,
    height: size.width,
  };
}

test.each([
  {
    videoSize: VIDEO_480_L,
    tileSize: TILE_SIZE_1_L,
    expected: "cover",
  },
  {
    videoSize: invertSize(VIDEO_480_L),
    tileSize: TILE_SIZE_1_L,
    expected: "contain",
  },
  {
    videoSize: VIDEO_720_L,
    tileSize: TILE_SIZE_4_L,
    expected: "cover",
  },
  {
    videoSize: invertSize(VIDEO_720_L),
    tileSize: TILE_SIZE_4_L,
    expected: "contain",
  },
  {
    videoSize: invertSize(VIDEO_1080_L),
    tileSize: TILE_SIZE_3_P,
    expected: "cover",
  },
  {
    videoSize: VIDEO_1080_L,
    tileSize: TILE_SIZE_5_P,
    expected: "contain",
  },
  {
    videoSize: invertSize(VIDEO_1080_L),
    tileSize: TILE_SIZE_5_P,
    expected: "cover",
  },
  {
    // square video
    videoSize: { width: 400, height: 400 },
    tileSize: VIDEO_480_L,
    expected: "contain",
  },
  {
    // Should default to cover if the initial size is 0:0.
    // Or else it will cause a flash of "contain" mode until the real size is loaded, which can be jarring.
    videoSize: VIDEO_480_L,
    tileSize: { width: 0, height: 0 },
    expected: "cover",
  },
  {
    videoSize: { width: 0, height: 0 },
    tileSize: VIDEO_480_L,
    expected: "cover",
  },
])(
  "videoFit$ returns $expected when videoSize is $videoSize and tileSize is $tileSize",
  ({ videoSize, tileSize, expected }) => {
    const scope = new ObservableScope();
    const videoSize$ = constant(videoSize);
    const tileSize$ = constant(tileSize);

    const fit = videoFit$(scope, videoSize$, tileSize$);
    expect(fit.value).toBe(expected);
  },
);

describe("extracting video size from participant stats", () => {
  function createMockRtpStats(
    isInbound: boolean,
    props: Partial<RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats> = {},
  ): RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats {
    const baseStats = {
      id: "mock-stats-id",
      timestamp: Date.now(),
      type: isInbound ? "inbound-rtp" : "outbound-rtp",
      kind: "video",
      ...props,
    };

    return baseStats as RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats;
  }

  test("get stats for local user", async () => {
    const localParticipant = mockLocalParticipant({
      identity: "@local:example.org:AAAAAA",
    });

    const mockReport: RTCStatsReport = new Map([
      [
        "OT01V639885149",
        createMockRtpStats(false, {
          frameWidth: 1280,
          frameHeight: 720,
        }),
      ],
    ]);

    const track = {
      source: Track.Source.Camera,
      getRTCStatsReport: vi
        .fn()
        .mockImplementation(async () => Promise.resolve(mockReport)),
    } as Partial<LocalTrack> as LocalTrack;

    // Set up the prototype chain (there is an instanceof check in getRTCStatsReport)
    Object.setPrototypeOf(track, LocalTrack.prototype);

    localParticipant.getTrackPublication = vi
      .fn()
      .mockImplementation((source: Track.Source) => {
        if (source === Track.Source.Camera) {
          return {
            track,
          } as unknown as LocalTrackPublication;
        } else {
          return undefined;
        }
      });

    const videoDimensions$ = videoSizeFromParticipant$(
      constant(localParticipant),
    );

    const publishedDimensions: { width: number; height: number }[] = [];
    videoDimensions$.subscribe((dimensions) => {
      if (dimensions) publishedDimensions.push(dimensions);
    });

    await flushPromises();

    const dimension = publishedDimensions.pop();
    expect(dimension).toEqual({ width: 1280, height: 720 });
  });

  test("get stats for remote user", async () => {
    // vi.useFakeTimers()
    const remoteParticipant = mockRemoteParticipant({
      identity: "@bob:example.org:AAAAAA",
    });

    const mockReport: RTCStatsReport = new Map([
      [
        "OT01V639885149",
        createMockRtpStats(true, {
          frameWidth: 480,
          frameHeight: 640,
        }),
      ],
    ]);

    const track = {
      source: Track.Source.Camera,
      getRTCStatsReport: vi
        .fn()
        .mockImplementation(async () => Promise.resolve(mockReport)),
    } as Partial<LocalTrack> as LocalTrack;

    // Set up the prototype chain (there is an instanceof check in getRTCStatsReport)
    Object.setPrototypeOf(track, LocalTrack.prototype);

    remoteParticipant.getTrackPublication = vi
      .fn()
      .mockImplementation((source: Track.Source) => {
        if (source === Track.Source.Camera) {
          return {
            track,
          } as unknown as RemoteTrackPublication;
        } else {
          return undefined;
        }
      });

    const videoDimensions$ = videoSizeFromParticipant$(
      constant(remoteParticipant),
    );

    const publishedDimensions: { width: number; height: number }[] = [];
    videoDimensions$.subscribe((dimensions) => {
      if (dimensions) publishedDimensions.push(dimensions);
    });

    await flushPromises();

    const dimension = publishedDimensions.pop();
    expect(dimension).toEqual({ width: 480, height: 640 });
  });
});
