/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../reactive/ObservableScope";
import { MediaConnectionState } from "../api";
import {
  CANDIDATE_BATCH_MS,
  createPeerConnectionBase,
  type PeerConnectionBase,
} from "./PeerConnection";
import { type ControlMessage, CONTROL_CHANNEL_LABEL } from "./ControlChannel";
import {
  type FakeSignalling,
  fakeSignalling,
  installWebRtcFakes,
  lastPeerConnection,
  peer,
  settle,
} from "./test";

describe("createPeerConnectionBase", () => {
  let scope: ObservableScope;
  let signalling: FakeSignalling;
  let base: PeerConnectionBase;
  let received: ControlMessage[];

  beforeEach(() => {
    vi.useFakeTimers();
    installWebRtcFakes();
    scope = new ObservableScope();
    signalling = fakeSignalling();
    received = [];
    base = createPeerConnectionBase({
      scope,
      peer,
      connectionId: "c1",
      signalling,
      iceServers: [{ urls: ["turn:example.org"] }],
      onControlMessage: (message) => received.push(message),
      logger,
    });
  });
  afterEach(() => {
    scope.end();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the ICE servers it was given", () => {
    expect(lastPeerConnection().config.iceServers).toEqual([
      { urls: ["turn:example.org"] },
    ]);
  });

  it("sends the candidates gathered within a batch in one message", () => {
    const pc = lastPeerConnection();
    pc.gather({ candidate: "a", sdpMid: "0", sdpMLineIndex: 0 });
    pc.gather({ candidate: "b", sdpMid: "0", sdpMLineIndex: 0 });
    pc.gather(null);
    expect(signalling.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CANDIDATE_BATCH_MS);
    expect(signalling.sent()).toEqual([
      {
        type: "candidates",
        candidates: [
          { candidate: "a", sdpMid: "0", sdpMLineIndex: 0 },
          { candidate: "b", sdpMid: "0", sdpMLineIndex: 0 },
          // The end of the gathering
          { candidate: "", sdpMid: null, sdpMLineIndex: null },
        ],
      },
    ]);
    expect(signalling.sentConnectionIds()).toEqual(["c1"]);
  });

  it("drops pending candidates when it closes", () => {
    lastPeerConnection().gather({ candidate: "a" });
    base.close("bye", false);
    vi.advanceTimersByTime(CANDIDATE_BATCH_MS);
    expect(signalling.send).not.toHaveBeenCalled();
  });

  it("runs queued operations in order, past a failing one", async () => {
    const order: string[] = [];
    base.enqueue(async () => {
      order.push("first");
      return Promise.reject(new Error("failed"));
    });
    base.enqueue(async () => {
      order.push("second");
      return Promise.resolve();
    });
    await settle();
    expect(order).toEqual(["first", "second"]);
  });

  it("applies received candidates, ignoring one that fails", async () => {
    base.addCandidates([{ candidate: "bad" }, { candidate: "good" }]);
    await settle();
    expect(lastPeerConnection().addedCandidates).toEqual([
      { candidate: "good" },
    ]);
  });

  it("tells the peer once when it closes", () => {
    base.close("done", true);
    base.close("again", true);
    expect(lastPeerConnection().closed).toBe(true);
    expect(signalling.sent()).toEqual([{ type: "close", reason: "done" }]);
  });

  it("doesn't tell a peer that closed first", () => {
    base.close("theirs", false);
    expect(lastPeerConnection().closed).toBe(true);
    expect(signalling.send).not.toHaveBeenCalled();
  });

  it("closes when its scope ends", () => {
    scope.end();
    expect(lastPeerConnection().closed).toBe(true);
    expect(signalling.sent()).toEqual([{ type: "close", reason: "ended" }]);
  });

  it("maps the connection state", () => {
    const pc = lastPeerConnection();
    expect(base.state$.value).toBe(MediaConnectionState.Initialized);
    pc.setConnectionState("connecting");
    expect(base.state$.value).toBe(MediaConnectionState.Connecting);
    pc.setConnectionState("connected");
    expect(base.state$.value).toBe(MediaConnectionState.Connected);
    pc.setConnectionState("disconnected");
    expect(base.state$.value).toBe(MediaConnectionState.Reconnecting);
    pc.setConnectionState("failed");
    expect(base.state$.value).toBeInstanceOf(Error);
    pc.setConnectionState("closed");
    expect(base.state$.value).toBe(MediaConnectionState.Stopped);
  });

  describe("the control channel", () => {
    const offer: ControlMessage = {
      type: "description",
      description: { type: "offer", sdp: "o" },
    };
    const metadata = (muted: boolean): ControlMessage => ({
      type: "stream_metadata",
      stream_metadata: { s: { purpose: "m.usermedia", audio_muted: muted } },
    });

    it("is negotiated, with the reserved label and id", () => {
      base.openControlChannel();
      base.openControlChannel();
      const [channel] = lastPeerConnection().dataChannels;
      expect(lastPeerConnection().dataChannels).toHaveLength(1);
      expect(channel.label).toBe(CONTROL_CHANNEL_LABEL);
      expect(channel.init).toEqual({ negotiated: true, id: 0 });
    });

    it("carries every message once it is open, apart from close", () => {
      base.openControlChannel();
      base.send(offer);
      expect(signalling.sent()).toEqual([offer]);

      const channel = lastPeerConnection().control();
      channel.open();
      base.send(offer);
      lastPeerConnection().gather({ candidate: "a" });
      vi.advanceTimersByTime(CANDIDATE_BATCH_MS);
      expect(channel.sentMessages()).toEqual([
        offer,
        { type: "candidates", candidates: [{ candidate: "a" }] },
      ]);

      base.close("done", true);
      expect(signalling.sent()).toEqual([
        offer,
        { type: "close", reason: "done" },
      ]);
    });

    it("holds the latest metadata until it opens", () => {
      base.openControlChannel();
      base.send(metadata(true));
      base.send(metadata(false));
      expect(signalling.send).not.toHaveBeenCalled();

      const channel = lastPeerConnection().control();
      channel.open();
      expect(channel.sentMessages()).toEqual([metadata(false)]);
    });

    it("hands over the messages it receives, ignoring what it doesn't know", () => {
      base.openControlChannel();
      const channel = lastPeerConnection().control();
      channel.open();
      channel.receive(metadata(true));
      channel.receive({ type: "future_message" });
      channel.receive("not json");
      channel.receive({ type: "description", description: { type: "x" } });
      expect(received).toEqual([metadata(true)]);
    });

    it("fails the connection when it closes on its own", () => {
      base.openControlChannel();
      const pc = lastPeerConnection();
      pc.setConnectionState("connected");
      pc.control().open();
      pc.control().close();
      expect(base.state$.value).toEqual(
        new Error("The control channel closed"),
      );
    });

    it("doesn't fail a connection we close", () => {
      base.openControlChannel();
      lastPeerConnection().control().open();
      base.close("done", true);
      expect(base.state$.value).not.toBeInstanceOf(Error);
    });
  });
});
