/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState as LivekitConnectionState,
  type RoomOptions,
} from "livekit-client";
import { logger } from "matrix-js-sdk/lib/logger";
import { type UnstableLivekitTransport } from "matrix-js-sdk/lib/matrixrtc";
import { describe, expect, it, vi } from "vitest";

import { type MediaQuality } from "../../config";
import { type PublishRequest } from "../../media-api";
import { constant } from "../../reactive/Behavior";
import { ownMemberMock, testScope } from "../../utils/test";
import { testJWTToken } from "../../utils/test-fixtures";
import { type ClientGetTokenParts, type ClientOpenIDParts } from "./auth";
import {
  LivekitConnectionFactory,
  type ResolvedConnection,
} from "./ConnectionFactory";
import { LivekitRooms } from "./LivekitRooms";
import { exampleTransport } from "./test";

const urlTransport: UnstableLivekitTransport = {
  type: "livekit",
  url: "wss://sfu.example.org",
};

function client(): ClientGetTokenParts & ClientOpenIDParts {
  return {
    getOpenIdToken: vi.fn(),
    _unstable_getLivekitToken: vi.fn().mockResolvedValue({ jwt: testJWTToken }),
  };
}

/**
 * Builds a subscriber connection and hands back the options its LiveKit room
 * was built with. The room is a real one: it never connects, and its options
 * are what the factory gave it, filled in with LiveKit's defaults.
 */
function create(
  publish: PublishRequest[],
  mediaQuality?: MediaQuality,
  audioOutputDeviceId?: string,
  transport = exampleTransport,
): { connection: ResolvedConnection; options: RoomOptions } {
  const factory = new LivekitConnectionFactory(
    client(),
    "!room:example.org",
    "m.call#ROOM",
    publish,
    constant(audioOutputDeviceId),
    undefined,
    mediaQuality,
    new LivekitRooms(logger),
  );
  const connection = factory.createConnection(
    testScope(),
    "subscriber",
    transport,
    "example.org",
    ownMemberMock,
    logger,
  ) as ResolvedConnection;
  return { connection, options: connection.livekitRoom.options };
}

describe("LivekitConnectionFactory", () => {
  it("builds the room on the defaults where nothing is requested", () => {
    const { options } = create([]);

    expect(options.publishDefaults).toMatchObject({ videoCodec: "vp8" });
    expect(options.videoCaptureDefaults).toMatchObject({
      resolution: expect.objectContaining({ height: 720 }),
    });
    expect(options.audioOutput).toEqual({ deviceId: undefined });
    expect(options.e2ee).toBeUndefined();
  });

  it("makes the initial microphone request the room's audio defaults", () => {
    const { options } = create([
      {
        source: "microphone",
        deviceId: "mic-1",
        capture: {
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: false,
        },
      },
    ]);

    expect(options.audioCaptureDefaults).toMatchObject({
      deviceId: "mic-1",
      echoCancellation: false,
      noiseSuppression: true,
      autoGainControl: false,
    });
  });

  it("makes the initial camera request the room's video and publish defaults", () => {
    const { options } = create(
      [
        {
          source: "camera",
          deviceId: "cam-1",
          capture: {
            resolution: { width: 1920, height: 1080, frameRate: 60 },
            maxBitrate: 4_000_000,
            maxFramerate: 60,
            codec: "vp9",
          },
        },
      ],
      { video_codec: "h264" },
    );

    expect(options.videoCaptureDefaults).toMatchObject({
      deviceId: "cam-1",
      resolution: { width: 1920, height: 1080, frameRate: 60 },
    });
    // The request wins over the media quality settings
    expect(options.publishDefaults).toMatchObject({
      videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 60 },
      videoCodec: "vp9",
    });
  });

  it("applies the media quality settings where the requests leave the defaults", () => {
    const { options } = create([{ source: "camera" }], {
      video_codec: "av1",
      video: { max_bitrate: 900_000, max_framerate: 24 },
    });

    expect(options.publishDefaults).toMatchObject({
      videoEncoding: { maxBitrate: 900_000, maxFramerate: 24 },
      videoCodec: "av1",
    });
  });

  it("plays on the output device selected when the room is built", () => {
    const { options } = create([], undefined, "speaker");
    expect(options.audioOutput).toEqual({ deviceId: "speaker" });
  });

  it("reports what it fetched while connected, and nothing before or after", async () => {
    const { connection } = create([], undefined, undefined, urlTransport);
    // The room must not reach for the network; its state is left as it is
    vi.spyOn(connection.livekitRoom, "connect").mockResolvedValue(undefined);
    vi.spyOn(connection.livekitRoom, "disconnect").mockResolvedValue(undefined);
    expect(connection.resolved$.value).toBeUndefined();

    await connection.start();

    expect(connection.state$.value).toEqual({
      state: "authenticated",
      livekitState: LivekitConnectionState.Disconnected,
    });
    expect(connection.resolved$.value).toEqual({
      type: "livekit",
      url: "wss://sfu.example.org",
      token: testJWTToken,
      roomAlias: "!example_room_id",
      identity: "@me:example.org:ABCDEF",
    });

    await connection.stop();
    expect(connection.resolved$.value).toBeUndefined();
  });
});
