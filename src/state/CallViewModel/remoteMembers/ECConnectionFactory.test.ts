/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Room as LivekitRoom } from "livekit-client";
import { BehaviorSubject } from "rxjs";
import fetchMock from "fetch-mock";
import { logger } from "matrix-js-sdk/lib/logger";
import EventEmitter from "events";

import { ObservableScope } from "../../ObservableScope.ts";
import { ECConnectionFactory } from "./ConnectionFactory.ts";
import type { OpenIDClientParts } from "../../../livekit/openIDSFU.ts";
import { exampleTransport, mockMediaDevices } from "../../../utils/test.ts";
import type { ProcessorState } from "../../../livekit/TrackProcessorContext.tsx";
import { constant } from "../../Behavior";

// At the top of your test file, after imports
vi.mock("livekit-client", async (importOriginal) => {
  return {
    ...(await importOriginal()),
    Room: vi.fn().mockImplementation(function (this: LivekitRoom, options) {
      const emitter = new EventEmitter();
      return {
        on: emitter.on.bind(emitter),
        off: emitter.off.bind(emitter),
        emit: emitter.emit.bind(emitter),
        disconnect: vi.fn(),
        remoteParticipants: new Map(),
      } as unknown as LivekitRoom;
    }),
  };
});

let testScope: ObservableScope;
let mockClient: OpenIDClientParts;

beforeEach(() => {
  testScope = new ObservableScope();
  mockClient = {
    getOpenIdToken: vi.fn().mockReturnValue(""),
    getDeviceId: vi.fn().mockReturnValue("DEV000"),
  };
});

describe("ECConnectionFactory - Audio inputs options", () => {
  test.each([
    { echo: true, noise: true },
    { echo: true, noise: false },
    { echo: false, noise: true },
    { echo: false, noise: false },
  ])(
    "it sets echoCancellation=$echo and noiseSuppression=$noise based on constructor parameters",
    ({ echo, noise }) => {
      // test("it sets echoCancellation and noiseSuppression based on constructor parameters", () => {
      const RoomConstructor = vi.mocked(LivekitRoom);

      const ecConnectionFactory = new ECConnectionFactory(
        mockClient,
        mockMediaDevices({}),
        new BehaviorSubject<ProcessorState>({
          supported: true,
          processor: undefined,
        }),
        undefined,
        false,
        undefined,
        echo,
        noise,
      );
      ecConnectionFactory.createConnection(exampleTransport, testScope, logger);

      // Check if Room was constructed with expected options
      expect(RoomConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          audioCaptureDefaults: expect.objectContaining({
            echoCancellation: echo,
            noiseSuppression: noise,
          }),
        }),
      );
    },
  );
});

describe("ECConnectionFactory - ControlledAudioDevice", () => {
  test.each([{ controlled: true }, { controlled: false }])(
    "it sets controlledAudioDevice=$controlled then uses deviceId accordingly",
    ({ controlled }) => {
      // test("it sets echoCancellation and noiseSuppression based on constructor parameters", () => {
      const RoomConstructor = vi.mocked(LivekitRoom);

      const ecConnectionFactory = new ECConnectionFactory(
        mockClient,
        mockMediaDevices({
          audioOutput: {
            available$: constant(new Map<never, never>()),
            selected$: constant({ id: "DEV00", virtualEarpiece: false }),
            select: () => {},
          },
        }),
        new BehaviorSubject<ProcessorState>({
          supported: true,
          processor: undefined,
        }),
        undefined,
        controlled,
        undefined,
        false,
        false,
      );
      ecConnectionFactory.createConnection(exampleTransport, testScope, logger);

      // Check if Room was constructed with expected options
      expect(RoomConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          audioOutput: expect.objectContaining({
            deviceId: controlled ? undefined : "DEV00",
          }),
        }),
      );
    },
  );
});

afterEach(() => {
  testScope.end();
  fetchMock.reset();
});
