/*
Copyright 2025, 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import {
  MatrixRTCSessionEvent,
  type Transport,
  type UnstableLivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { EventEmitter } from "events";

import {
  createKeyRotationSuppressed$,
  membershipsAndTransports$,
} from "./SessionBehaviors";
import { Epoch } from "./ObservableScope";
import { constant } from "./Behavior";
import { mockRtcMembership, testScope } from "../utils/test";

describe("SessionBehaviors", () => {
  describe("createKeyRotationSuppressed$", () => {
    it("emits initial value from isKeyRotationSuppressed and updates when KeyRotationSuppressedChanged event is emitted", () => {
      const scope = testScope();
      const emitter = new EventEmitter();
      const mockSession = Object.assign(emitter, {
        on: vi.fn(),
        off: vi.fn(),
        isKeyRotationSuppressed: false,
      });

      const keyRotationSuppressed$ = createKeyRotationSuppressed$(
        scope,
        mockSession as any,
      );

      expect(keyRotationSuppressed$.value).toBe(false);
      emitter.emit(MatrixRTCSessionEvent.KeyRotationSuppressedChanged, true);

      expect(keyRotationSuppressed$.value).toBe(true);

      emitter.emit(MatrixRTCSessionEvent.KeyRotationSuppressedChanged, false);

      expect(keyRotationSuppressed$.value).toBe(false);
    });
  });

  describe("membershipsAndTransports$", () => {
    const serviceTransport: UnstableLivekitTransport = {
      type: "livekit",
      livekit_service_url: "https://lk.example.org",
    };
    const urlTransport: UnstableLivekitTransport = {
      type: "livekit",
      url: "wss://sfu.sample.com",
    };

    it("locates each member's transport on the member's homeserver", () => {
      const bob = mockRtcMembership("@bob:example.org", "DEV000", {
        fociPreferred: [serviceTransport],
      });
      const carl = mockRtcMembership("@carl:sample.com", "DEV111", {
        fociPreferred: [urlTransport],
      });

      const { membershipsWithTransport$, transports$ } =
        membershipsAndTransports$(
          testScope(),
          constant(new Epoch([bob, carl])),
        );

      expect(transports$.value.value).toEqual([
        { transport: serviceTransport, serverName: "example.org" },
        { transport: urlTransport, serverName: "sample.com" },
      ]);
      expect(
        membershipsWithTransport$.value.value.map(
          (m) => m.transport?.serverName,
        ),
      ).toEqual(["example.org", "sample.com"]);
    });

    it("locates a remote publisher's transport on the SFU's homeserver", () => {
      // Dave has no SFU of his own and publishes on sample.com's
      const remoteTransport: UnstableLivekitTransport = {
        ...urlTransport,
        server_name: "sample.com",
      };
      const dave = mockRtcMembership("@dave:example.org", "DEV222", {
        fociPreferred: [remoteTransport],
      });

      const { transports$ } = membershipsAndTransports$(
        testScope(),
        constant(new Epoch([dave])),
      );

      expect(transports$.value.value).toEqual([
        { transport: remoteTransport, serverName: "sample.com" },
      ]);
    });

    it("leaves out members without a LiveKit transport", () => {
      const dave = mockRtcMembership("@dave:example.org", "DEV222", {
        fociPreferred: [{ type: "something-else" } as Transport],
      });

      const { membershipsWithTransport$, transports$ } =
        membershipsAndTransports$(testScope(), constant(new Epoch([dave])));

      expect(transports$.value.value).toEqual([]);
      expect(membershipsWithTransport$.value.value).toEqual([
        { membership: dave, transport: undefined },
      ]);
    });
  });
});
