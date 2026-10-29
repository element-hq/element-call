/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../reactive/ObservableScope";
import { type FullMeshLocalMedia } from "./LocalMedia";
import { type ConsumptionMetadata } from "./metadata";
import {
  createPublisherConnection,
  type PublisherConnection,
} from "./PublisherConnection";
import { CONTROL_CHANNEL_LABEL } from "./ControlChannel";
import { DATA_PROTOCOL, DATA_PURPOSE, DATA_STREAM_ID } from "./metadata";
import {
  type FakeSignalling,
  fakeLocalMedia,
  fakePublication,
  fakeSignalling,
  fakeTrack,
  fromPeer,
  type PeerMessage,
  installWebRtcFakes,
  lastPeerConnection,
  peer,
  settle,
} from "./test";

describe("createPublisherConnection", () => {
  let scope: ObservableScope;
  let signalling: FakeSignalling;
  let local: ReturnType<typeof fakeLocalMedia>;

  function create(): PublisherConnection {
    return createPublisherConnection({
      scope,
      peer,
      connectionId: "c1",
      signalling,
      iceServers: [],
      local: local as unknown as FullMeshLocalMedia,
      logger,
    });
  }

  const answer = (consumption?: ConsumptionMetadata): PeerMessage =>
    fromPeer("c1", {
      type: "description",
      description: { type: "answer", sdp: "answer" },
      consumption_metadata: consumption,
    });
  const dataStream = {
    [DATA_STREAM_ID]: { purpose: DATA_PURPOSE, protocol: DATA_PROTOCOL },
  };

  beforeEach(() => {
    installWebRtcFakes();
    scope = new ObservableScope();
    signalling = fakeSignalling();
    local = fakeLocalMedia();
  });
  afterEach(() => {
    scope.end();
    vi.unstubAllGlobals();
  });

  it("offers right away, even without tracks, with the stream metadata", async () => {
    local.streamMetadata$.next({ s: { purpose: "m.usermedia" } });
    create();
    await settle();
    expect(signalling.sent("description")).toEqual([
      {
        type: "description",
        description: { type: "offer", sdp: "offer-1" },
        stream_metadata: { s: { purpose: "m.usermedia" }, ...dataStream },
      },
    ]);
  });

  it("creates the control channel and the data stream before its first offer", () => {
    create();
    const labels = lastPeerConnection().dataChannels.map((c) => c.label);
    expect(labels).toEqual([CONTROL_CHANNEL_LABEL, DATA_STREAM_ID]);
    expect(lastPeerConnection().offers).toBe(0);
  });

  it("sends each publication on a sendonly transceiver in its stream", async () => {
    const mic = fakePublication("audio");
    const camera = fakePublication("video", mic.stream);
    local.publications$.next([mic, camera]);
    create();
    await settle();

    const [a, v] = lastPeerConnection().transceivers;
    expect(a).toMatchObject({ kind: "audio", direction: "sendonly" });
    expect(a.streams).toEqual([mic.stream]);
    expect(a.sender.track).toBe(mic.track$.value);
    expect(v).toMatchObject({ kind: "video", direction: "sendonly" });
    expect(v.sender.track).toBe(camera.track$.value);
    // One offer for both
    expect(signalling.sent("description")).toHaveLength(1);
  });

  it("follows a track change without renegotiating", async () => {
    const camera = fakePublication("video");
    local.publications$.next([camera]);
    create();
    await settle();
    const next = fakeTrack("video");
    camera.track$.next(next);
    expect(lastPeerConnection().transceivers[0].sender.track).toBe(next);
    expect(signalling.sent("description")).toHaveLength(1);
  });

  it("sends nothing while not publishing", async () => {
    const camera = fakePublication("video");
    local.publications$.next([camera]);
    local.publishing$.next(false);
    create();
    await settle();
    const { sender } = lastPeerConnection().transceivers[0];
    expect(sender.track).toBeNull();

    local.publishing$.next(true);
    expect(sender.track).toBe(camera.track$.value);
  });

  it("holds changes while an offer is unanswered, then offers once for all", async () => {
    const connection = create();
    const pc = lastPeerConnection();
    await settle();
    expect(pc.offers).toBe(1);

    local.publications$.next([fakePublication("audio")]);
    local.publications$.next([
      ...local.publications$.value,
      fakePublication("video"),
    ]);
    await settle();
    expect(pc.offers).toBe(1);

    connection.handle(answer());
    await settle();
    expect(pc.offers).toBe(2);
    expect(pc.transceivers).toHaveLength(2);

    // Nothing changed since: the next answer doesn't lead to another offer
    connection.handle(answer());
    await settle();
    expect(pc.offers).toBe(2);
  });

  it("stops the transceiver of a removed publication and renegotiates", async () => {
    const camera = fakePublication("video");
    local.publications$.next([camera]);
    const connection = create();
    await settle();
    connection.handle(answer());
    await settle();

    local.publications$.next([]);
    await settle();
    const pc = lastPeerConnection();
    expect(pc.transceivers[0].stopped).toBe(true);
    expect(pc.offers).toBe(2);
  });

  it("signals mute changes over the control channel without renegotiating", async () => {
    create();
    await settle();
    const control = lastPeerConnection().control();
    control.open();
    local.streamMetadata$.next({
      s: { purpose: "m.usermedia", audio_muted: true },
    });
    expect(control.sentMessages()).toEqual([
      {
        type: "stream_metadata",
        stream_metadata: {
          s: { purpose: "m.usermedia", audio_muted: true },
          ...dataStream,
        },
      },
    ]);
    expect(lastPeerConnection().offers).toBe(1);
  });

  it("renegotiates over the control channel once it is open", async () => {
    const connection = create();
    await settle();
    connection.handle(answer());
    await settle();
    const control = lastPeerConnection().control();
    control.open();

    local.publications$.next([fakePublication("audio")]);
    await settle();
    expect(control.sentMessages()).toContainEqual(
      expect.objectContaining({
        type: "description",
        description: { type: "offer", sdp: "offer-2" },
      }),
    );
    expect(signalling.sent("description")).toHaveLength(1);

    // The answer comes back the same way
    control.receive({
      type: "description",
      description: { type: "answer", sdp: "answer-2" },
    });
    await settle();
    expect(lastPeerConnection().remoteDescription).toEqual({
      type: "answer",
      sdp: "answer-2",
    });
  });

  describe("consumption metadata", () => {
    it("stops sending a stream that isn't in use, without renegotiating", async () => {
      const camera = fakePublication("video");
      local.publications$.next([camera]);
      const connection = create();
      await settle();
      connection.handle(answer({ [camera.stream.id]: { in_use: false } }));
      await settle();
      const { sender } = lastPeerConnection().transceivers[0];
      expect(sender.track).toBeNull();

      const control = lastPeerConnection().control();
      control.open();
      control.receive({
        type: "consumption_metadata",
        consumption_metadata: {},
      });
      await settle();
      expect(sender.track).toBe(camera.track$.value);
      expect(lastPeerConnection().offers).toBe(1);
    });

    it("scales the video down to the largest size shown", async () => {
      const camera = fakePublication("video");
      camera.track$.next(fakeTrack("video", { width: 1280, height: 720 }));
      local.publications$.next([camera]);
      const connection = create();
      await settle();
      connection.handle(
        answer({
          [camera.stream.id]: {
            max_width: 320,
            max_height: 320,
            max_framerate: 15,
          },
        }),
      );
      await settle();
      const { sender } = lastPeerConnection().transceivers[0];
      expect(sender.parameters.encodings).toEqual([
        { scaleResolutionDownBy: 4, maxFramerate: 15 },
      ]);

      // Larger than the camera: sent as it is
      const control = lastPeerConnection().control();
      control.open();
      control.receive({
        type: "consumption_metadata",
        consumption_metadata: {
          [camera.stream.id]: { max_width: 4000, max_height: 4000 },
        },
      });
      await settle();
      expect(sender.parameters.encodings).toEqual([
        { scaleResolutionDownBy: 1 },
      ]);
    });
  });

  describe("the data stream", () => {
    it("sends once it is open", () => {
      const connection = create();
      expect(connection.sendData("early")).toBe(false);
      const data = lastPeerConnection().dataChannels[1];
      data.open();
      expect(connection.sendData("hello")).toBe(true);
      expect(data.sent).toEqual(["hello"]);
    });

    it("sends nothing while the subscriber doesn't use it", async () => {
      const connection = create();
      await settle();
      connection.handle(answer({ [DATA_STREAM_ID]: { in_use: false } }));
      await settle();
      lastPeerConnection().dataChannels[1].open();
      expect(connection.sendData("hello")).toBe(false);
    });
  });

  it("closes, telling the subscriber, when the control channel fails", async () => {
    create();
    await settle();
    const pc = lastPeerConnection();
    pc.control().open();
    pc.control().close();
    expect(pc.closed).toBe(true);
    expect(signalling.sent("close")).toEqual([
      { type: "close", reason: "failed" },
    ]);
  });

  it("applies the subscriber's candidates", async () => {
    const connection = create();
    await settle();
    connection.handle(answer());
    connection.handle(
      fromPeer("c1", {
        type: "candidates",
        candidates: [{ candidate: "x" }],
      }),
    );
    await settle();
    expect(lastPeerConnection().addedCandidates).toEqual([{ candidate: "x" }]);
  });

  it("ends without answering when the subscriber closes", async () => {
    const connection = create();
    await settle();
    connection.handle(fromPeer("c1", { type: "close", reason: "bye" }));
    const pc = lastPeerConnection();
    expect(pc.closed).toBe(true);
    expect(signalling.sent("close")).toEqual([]);
    // Its scope ended: no more offers go out
    local.publications$.next([fakePublication("audio")]);
    await settle();
    expect(pc.offers).toBe(1);
  });
});
