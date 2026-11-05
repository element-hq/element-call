/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { constant } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import {
  DATA_CHANNEL_LABEL,
  DATA_PROTOCOL,
  type TrackMetadata,
} from "./metadata";
import {
  createSubscriberConnection,
  type SubscriberConnection,
} from "./SubscriberConnection";
import {
  type FakeSignalling,
  fakeSignalling,
  fromPeer,
  type PeerMessage,
  installWebRtcFakes,
  lastPeerConnection,
  peer,
  settle,
} from "./test";

describe("createSubscriberConnection", () => {
  let scope: ObservableScope;
  let signalling: FakeSignalling;
  let subscriber: SubscriberConnection;

  beforeEach(async () => {
    vi.useFakeTimers();
    installWebRtcFakes();
    scope = new ObservableScope();
    signalling = fakeSignalling();
    subscriber = createSubscriberConnection({
      scope,
      peer,
      signalling,
      iceServers: async () => Promise.resolve([{ urls: ["turn:x"] }]),
      audioOutputDeviceId$: constant(undefined),
      logger,
    });
    await settle();
  });
  afterEach(() => {
    scope.end();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("asks the publisher for its media on a fresh connection", () => {
    expect(signalling.sent()).toEqual([{ type: "subscribe" }]);
    expect(signalling.sentConnectionIds()).toEqual([current()]);
    expect(lastPeerConnection().config.iceServers).toEqual([
      { urls: ["turn:x"] },
    ]);
  });

  it("answers an offer and shows the tracks it brings", async () => {
    expect(subscriber.tracks$.value).toBeNull();
    const pc = lastPeerConnection();
    pc.receive("video", "1");
    pc.receive("video", "2");

    subscriber.handle(
      offer(current(), {
        "1": { purpose: "m.usermedia", muted: true },
        "2": { purpose: "m.screenshare" },
      }),
    );
    await settle();

    expect(pc.remoteDescription).toEqual({ type: "offer", sdp: "offer" });
    // How it shows them goes over the control channel once it is open
    expect(signalling.sent("description")).toEqual([
      { type: "description", description: { type: "answer", sdp: "answer" } },
    ]);
    const tracks = subscriber.tracks$.value!;
    expect(tracks.map((t) => [t.source, t.kind, t.muted$.value])).toEqual([
      ["camera", "video", true],
      ["screenShare", "video", false],
    ]);
  });

  it("names audio by its purpose", async () => {
    const pc = lastPeerConnection();
    pc.receive("audio", "0");
    pc.receive("audio", "3");
    subscriber.handle(
      offer(current(), {
        "0": { purpose: "m.usermedia" },
        "3": { purpose: "m.screenshare" },
      }),
    );
    await settle();
    expect(subscriber.tracks$.value!.map((t) => t.source)).toEqual([
      "microphone",
      "screenShareAudio",
    ]);
  });

  it("leaves out tracks without metadata or with an unknown purpose", async () => {
    const pc = lastPeerConnection();
    pc.receive("video", "0");
    pc.receive("video", "1");
    subscriber.handle(offer(current(), { "1": { purpose: "m.whiteboard" } }));
    await settle();
    expect(subscriber.tracks$.value).toEqual([]);
  });

  it("follows mute changes, keeping the same track", async () => {
    lastPeerConnection().receive("video", "1");
    subscriber.handle(offer(current(), { "1": { purpose: "m.usermedia" } }));
    await settle();
    const [track] = subscriber.tracks$.value!;
    expect(track.muted$.value).toBe(false);

    lastPeerConnection()
      .control()
      .receive({
        type: "track_metadata",
        track_metadata: { "1": { purpose: "m.usermedia", muted: true } },
      });
    await settle();
    expect(subscriber.tracks$.value).toEqual([track]);
    expect(track.muted$.value).toBe(true);
  });

  it("drops a track whose transceiver no longer receives", async () => {
    const pc = lastPeerConnection();
    const transceiver = pc.receive("video", "1");
    subscriber.handle(offer(current(), { "1": { purpose: "m.usermedia" } }));
    await settle();
    expect(subscriber.tracks$.value).toHaveLength(1);

    transceiver.currentDirection = "inactive";
    subscriber.handle(offer(current(), { "1": { purpose: "m.usermedia" } }));
    await settle();
    expect(subscriber.tracks$.value).toEqual([]);
  });

  it("ignores messages of another connection", async () => {
    subscriber.handle(offer("other", {}));
    await settle();
    expect(lastPeerConnection().remoteDescription).toBeNull();
  });

  it("subscribes anew after the publisher closes, backing off", async () => {
    const first = current();
    subscriber.handle(fromPeer(first, { type: "close", reason: "nope" }));
    expect(subscriber.current$.value).toBeNull();
    expect(subscriber.tracks$.value).toBeNull();
    // It doesn't echo the publisher's close
    expect(signalling.sent("close")).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_000);
    const second = current();
    expect(second).not.toBe(first);
    expect(signalling.sentConnectionIds("subscribe")).toEqual([first, second]);

    // A failed connection is closed and retried after twice the wait
    lastPeerConnection().setConnectionState("failed");
    expect(signalling.sent("close")).toEqual([
      { type: "close", reason: "failed" },
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signalling.sent("subscribe")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(signalling.sent("subscribe")).toHaveLength(3);
  });

  it("stops retrying once its scope ends", async () => {
    subscriber.handle(fromPeer(current(), { type: "close", reason: "nope" }));
    scope.end();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signalling.sent("subscribe")).toHaveLength(1);
  });

  describe("the control channel", () => {
    it("is created once the offer is applied", async () => {
      const pc = lastPeerConnection();
      expect(pc.dataChannels).toEqual([]);
      subscriber.handle(offer(current(), {}));
      await settle();
      expect(pc.control().init).toEqual({ negotiated: true, id: 0 });
    });

    it("failing leads to a new subscription", async () => {
      const first = current();
      subscriber.handle(offer(first, {}));
      await settle();
      const control = lastPeerConnection().control();
      control.open();
      control.close();
      expect(signalling.sent("close")).toEqual([
        { type: "close", reason: "failed" },
      ]);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(current()).not.toBe(first);
    });

    it("carries the answers to later offers", async () => {
      subscriber.handle(offer(current(), {}));
      await settle();
      const control = lastPeerConnection().control();
      control.open();
      control.receive({
        type: "description",
        description: { type: "offer", sdp: "offer-2" },
        track_metadata: {},
      });
      await vi.advanceTimersByTimeAsync(200);
      expect(control.sentMessages()).toContainEqual({
        type: "description",
        description: { type: "answer", sdp: "answer" },
      });
      expect(signalling.sent("description")).toHaveLength(1);
    });
  });

  describe("consumption metadata", () => {
    it("tells the publisher how each video is shown, once the channel is open", async () => {
      const pc = lastPeerConnection();
      pc.receive("audio", "0");
      pc.receive("video", "1");
      subscriber.handle(
        offer(current(), {
          "0": { purpose: "m.usermedia" },
          "1": { purpose: "m.usermedia" },
        }),
      );
      await vi.advanceTimersByTimeAsync(200);
      const control = pc.control();
      control.open();
      // Nothing shows the video yet; the audio is always in use
      expect(control.sentMessages()).toEqual([
        {
          type: "consumption_metadata",
          consumption_metadata: { "1": { in_use: false } },
        },
      ]);

      const video = subscriber.tracks$.value!.find((t) => t.kind === "video")!;
      const element = { paused: false } as HTMLMediaElement;
      video.attach(element);
      await vi.advanceTimersByTimeAsync(200);
      // Shown at a size the platform doesn't report: no constraint at all
      expect(control.sentMessages().at(-1)).toEqual({
        type: "consumption_metadata",
        consumption_metadata: {},
      });

      video.detach(element);
      await vi.advanceTimersByTimeAsync(200);
      expect(control.sentMessages().at(-1)).toEqual({
        type: "consumption_metadata",
        consumption_metadata: { "1": { in_use: false } },
      });
    });
  });

  describe("the data channel", () => {
    it("delivers what the publisher sends on it", async () => {
      const received: string[] = [];
      subscriber.data$.subscribe((text) => received.push(text));
      subscriber.handle(offer(current(), {}));
      await settle();
      const pc = lastPeerConnection();
      pc.announceDataChannel(DATA_CHANNEL_LABEL, DATA_PROTOCOL).receive("hi");
      expect(received).toEqual(["hi"]);
    });

    it("ignores a channel whose protocol it doesn't know, whatever its label", async () => {
      const received: string[] = [];
      subscriber.data$.subscribe((text) => received.push(text));
      subscriber.handle(offer(current(), {}));
      await settle();
      const pc = lastPeerConnection();
      pc.announceDataChannel(DATA_CHANNEL_LABEL, "x.other").receive("no");
      pc.announceDataChannel(DATA_CHANNEL_LABEL).receive("no");
      expect(received).toEqual([]);
    });
  });

  function offer(connectionId: string, metadata: TrackMetadata): PeerMessage {
    return fromPeer(connectionId, {
      type: "description",
      description: { type: "offer", sdp: "offer" },
      track_metadata: metadata,
    });
  }

  /** The connection id of the current attempt. */
  function current(): string {
    const base = subscriber.current$.value;
    if (base === null) throw new Error("No current attempt");
    return base.connectionId;
  }
});
