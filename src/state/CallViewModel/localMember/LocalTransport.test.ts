/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from "vitest";
import fetchMock from "fetch-mock";

import { mockConfig } from "../../../utils/test";
import { getLocalTransport } from "./LocalTransport";
import { MatrixRTCTransportMissingError } from "../../../utils/errors";
import { customTransport } from "../../../settings/settings";
import { type MatrixClient } from "matrix-js-sdk";

describe("LocalTransport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws if config is missing", async () => {
    await expect(
      getLocalTransport({
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getDomain: () => "example.org",
      }),
    ).rejects.toThrow(new MatrixRTCTransportMissingError("example.org"));
  });

  it("returns preferred transport", async () => {
    // Use config so transport discovery succeeds
    mockConfig({
      livekit: { livekit_service_url: "https://lk.example.org" },
    });

    expect(
      await getLocalTransport({
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getDomain: () => "example.org",
      }),
    ).toStrictEqual({
      livekit_service_url: "https://lk.example.org",
      type: "livekit",
    });
  });

  describe("transport configuration mechanisms", () => {
    let client: MockedObject<
      Pick<MatrixClient, "getDomain" | "_unstable_getRTCTransports">
    >;
    beforeEach(() => {
      mockConfig({});
      customTransport.setValue(customTransport.defaultValue);
      client = {
        getDomain: vi.fn().mockReturnValue("example.org"),
        _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
      };
    });

    afterEach(() => {
      fetchMock.reset();
    });

    it("supports getting transport via application config", async () => {
      mockConfig({
        livekit: { livekit_service_url: "https://lk.example.org" },
      });

      expect(await getLocalTransport(client)).toStrictEqual({
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
    });

    it("supports getting transport via user settings", async () => {
      customTransport.setValue({
        type: "livekit",
        livekit_service_url: "https://lk.example.org",
      });

      expect(await getLocalTransport(client)).toStrictEqual({
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
    });

    it("supports getting transport via backend", async () => {
      client._unstable_getRTCTransports.mockResolvedValue([
        { type: "livekit", livekit_service_url: "https://lk.example.org" },
      ]);

      expect(await getLocalTransport(client)).toStrictEqual({
        livekit_service_url: "https://lk.example.org",
        type: "livekit",
      });
    });

    it("throws if no options are available", async () => {
      await expect(
        getLocalTransport({
          getDomain: () => "example.org",
          _unstable_getRTCTransports: async () => Promise.resolve([]),
        }),
      ).rejects.toThrow(new MatrixRTCTransportMissingError("example.org"));
    });
  });
});
