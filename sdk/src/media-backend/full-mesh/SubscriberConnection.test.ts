/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { constant } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { CONTROL_CHANNEL_LABEL } from "./ControlChannel";
import {
  DATA_PROTOCOL,
  DATA_PURPOSE,
  DATA_STREAM_ID,
  type StreamMetadata,
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

  const offer = (connectionId: string, metadata: StreamMetadata): PeerMessage =>
    fromPeer(connectionId, {
      type: "description",
      description: { type: "offer", sdp: "offer" },
      stream_metadata: metadata,
    });

  /** The connection id of the current attempt. */
  const current = (): string => {
    const base = subscriber.current$.value;
    if (base === null) throw new Error("No current attempt");
    return base.connectionId;
  };

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
    pc.receive("video", "user");
    pc.receive("video", "screen");

    subscriber.handle(
      offer(current(), {
        user: { purpose: "m.usermedia", video_muted: true },
        screen: { purpose: "m.screenshare" },
      }),
    );
    await settle();

    expect(pc.remoteDescription).toEqual({ type: "offer", sdp: "offer" });
    expect(signalling.sent("description")).toEqual([
      {
        type: "description",
        description: { type: "answer", sdp: "answer" },
        // Nothing shows the video yet
        consumption_metadata: {
          user: { in_use: false },
          screen: { in_use: false },
        },
      },
    ]);
    const tracks = subscriber.tracks$.value!;
    expect(tracks.map((t) => [t.source, t.kind, t.muted$.value])).toEqual([
      ["camera", "video", true],
      ["screenShare", "video", false],
    ]);
  });

  it("names audio by its stream's purpose", async () => {
    const pc = lastPeerConnection();
    pc.receive("audio", "user");
    pc.receive("audio", "screen");
    subscriber.handle(
      offer(current(), {
        user: { purpose: "m.usermedia" },
        screen: { purpose: "m.screenshare" },
      }),
    );
    await settle();
    expect(subscriber.tracks$.value!.map((t) => t.source)).toEqual([
      "microphone",
      "screenShareAudio",
    ]);
  });

  it("leaves out streams without metadata or with an unknown purpose", async () => {
    const pc = lastPeerConnection();
    pc.receive("video", "unknown");
    pc.receive("video", "other");
    subscriber.handle(
      offer(current(), {
        other: { purpose: "m.whiteboard" as "m.usermedia" },
      }),
    );
    await settle();
    expect(subscriber.tracks$.value).toEqual([]);
  });

  it("follows mute changes, keeping the same track", async () => {
    lastPeerConnection().receive("video", "user");
    subscriber.handle(offer(current(), { user: { purpose: "m.usermedia" } }));
    await settle();
    const [track] = subscriber.tracks$.value!;
    expect(track.muted$.value).toBe(false);

    lastPeerConnection()
      .control()
      .receive({
        type: "stream_metadata",
        stream_metadata: {
          user: { purpose: "m.usermedia", video_muted: true },
        },
      });
    await settle();
    expect(subscriber.tracks$.value).toEqual([track]);
    expect(track.muted$.value).toBe(true);
  });

  it("drops a track whose transceiver no longer receives", async () => {
    const pc = lastPeerConnection();
    const transceiver = pc.receive("video", "user");
    subscriber.handle(offer(current(), { user: { purpose: "m.usermedia" } }));
    await settle();
    expect(subscriber.tracks$.value).toHaveLength(1);

    transceiver.currentDirection = "inactive";
    subscriber.handle(offer(current(), { user: { purpose: "m.usermedia" } }));
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

  it("creates its side of the control channel once it applied the offer", async () => {
    const pc = lastPeerConnection();
    expect(pc.dataChannels).toEqual([]);
    subscriber.handle(offer(current(), {}));
    await settle();
    expect(pc.control().init).toEqual({ negotiated: true, id: 0 });
  });

  it("subscribes anew when the control channel closes", async () => {
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

  it("answers later offers over the control channel, without consumption metadata", async () => {
    subscriber.handle(offer(current(), {}));
    await settle();
    const control = lastPeerConnection().control();
    control.open();
    control.receive({
      type: "description",
      description: { type: "offer", sdp: "offer-2" },
      stream_metadata: {},
    });
    await settle();
    expect(control.sentMessages()).toEqual([
      {
        type: "description",
        description: { type: "answer", sdp: "answer" },
      },
    ]);
    expect(signalling.sent("description")).toHaveLength(1);
  });

  it("tells the publisher once the video is shown", async () => {
    lastPeerConnection().receive("video", "user");
    subscriber.handle(offer(current(), { user: { purpose: "m.usermedia" } }));
    await settle();
    const control = lastPeerConnection().control();
    control.open();

    const [track] = subscriber.tracks$.value!;
    const element = { paused: false } as HTMLMediaElement;
    track.attach(element);
    await vi.advanceTimersByTimeAsync(200);
    // Shown at a size the platform doesn't report: no constraint at all
    expect(control.sentMessages()).toEqual([
      { type: "consumption_metadata", consumption_metadata: {} },
    ]);

    track.detach(element);
    await vi.advanceTimersByTimeAsync(200);
    expect(control.sentMessages().at(-1)).toEqual({
      type: "consumption_metadata",
      consumption_metadata: { user: { in_use: false } },
    });
  });

  it("keeps a stream with audio in use while its video is hidden", async () => {
    const pc = lastPeerConnection();
    pc.receive("audio", "user");
    pc.receive("video", "user");
    subscriber.handle(offer(current(), { user: { purpose: "m.usermedia" } }));
    await settle();
    expect(signalling.sent("description")).toEqual([
      expect.objectContaining({ consumption_metadata: {} }),
    ]);
  });

  describe("the data stream", () => {
    const dataStream = {
      [DATA_STREAM_ID]: { purpose: DATA_PURPOSE, protocol: DATA_PROTOCOL },
    };

    it("delivers what the publisher sends on it", async () => {
      const received: string[] = [];
      subscriber.data$.subscribe((text) => received.push(text));
      subscriber.handle(offer(current(), dataStream));
      await settle();
      const pc = lastPeerConnection();
      pc.announceDataChannel(DATA_STREAM_ID).receive("hello");
      // Unknown streams, and one posing as the control channel
      pc.announceDataChannel("other").receive("nope");
      pc.announceDataChannel(CONTROL_CHANNEL_LABEL).receive("nope");
      expect(received).toEqual(["hello"]);
    });

    it("ignores it while its protocol is unknown", async () => {
      const received: string[] = [];
      subscriber.data$.subscribe((text) => received.push(text));
      subscriber.handle(
        offer(current(), {
          [DATA_STREAM_ID]: { purpose: DATA_PURPOSE, protocol: "x.other" },
        }),
      );
      await settle();
      lastPeerConnection().announceDataChannel(DATA_STREAM_ID).receive("hi");
      expect(received).toEqual([]);
    });
  });
});
