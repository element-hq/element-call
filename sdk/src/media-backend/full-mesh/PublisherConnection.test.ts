/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../reactive/ObservableScope";
import { CONTROL_CHANNEL_LABEL } from "./ControlChannel";
import { type FullMeshLocalMedia } from "./LocalMedia";
import { DATA_CHANNEL_LABEL, DATA_PROTOCOL } from "./metadata";
import {
  createPublisherConnection,
  type PublisherConnection,
} from "./PublisherConnection";
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

  const answer = (): PeerMessage =>
    fromPeer("c1", {
      type: "description",
      description: { type: "answer", sdp: "answer" },
    });

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

  it("offers right away, even without tracks", async () => {
    create();
    await settle();
    expect(signalling.sent("description")).toEqual([
      {
        type: "description",
        description: { type: "offer", sdp: "offer-1" },
        track_metadata: {},
      },
    ]);
  });

  it("describes each track by the mid it gets with the offer", async () => {
    const mic = fakePublication("audio");
    const camera = fakePublication("video", { stream: mic.stream });
    const screen = fakePublication("video", { source: "screenShare" });
    camera.muted$.next(true);
    local.publications$.next([mic, camera, screen]);
    create();
    await settle();
    expect(signalling.sent("description")).toEqual([
      expect.objectContaining({
        track_metadata: {
          "0": { purpose: "m.usermedia", muted: false },
          "1": { purpose: "m.usermedia", muted: true },
          "2": { purpose: "m.screenshare", muted: false },
        },
      }),
    ]);
  });

  it("creates the control channel and the data channel before its first offer", () => {
    create();
    const [control, data] = lastPeerConnection().dataChannels;
    expect(control.label).toBe(CONTROL_CHANNEL_LABEL);
    expect(data).toMatchObject({
      label: DATA_CHANNEL_LABEL,
      protocol: DATA_PROTOCOL,
    });
    expect(lastPeerConnection().offers).toBe(0);
  });

  it("sends each publication on a sendonly transceiver in its stream", async () => {
    const mic = fakePublication("audio");
    const camera = fakePublication("video", { stream: mic.stream });
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
    const mic = fakePublication("audio");
    local.publications$.next([mic]);
    const connection = create();
    await settle();
    connection.handle(answer());
    await settle();
    const control = lastPeerConnection().control();
    control.open();
    mic.muted$.next(true);
    expect(control.sentMessages()).toEqual([
      {
        type: "track_metadata",
        track_metadata: { "0": { purpose: "m.usermedia", muted: true } },
      },
    ]);
    expect(lastPeerConnection().offers).toBe(1);
  });

  it("holds a mute change until its to-device offer is answered", async () => {
    const mic = fakePublication("audio");
    local.publications$.next([mic]);
    const connection = create();
    await settle();
    const control = lastPeerConnection().control();
    control.open();
    mic.muted$.next(true);
    expect(control.sentMessages()).toEqual([]);

    connection.handle(answer());
    await settle();
    expect(control.sentMessages()).toEqual([
      {
        type: "track_metadata",
        track_metadata: { "0": { purpose: "m.usermedia", muted: true } },
      },
    ]);
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
    /** A connection sending one camera track, with its control channel open. */
    async function sendingCamera(settings: MediaTrackSettings = {}): Promise<{
      camera: ReturnType<typeof fakePublication>;
      consume: (metadata: unknown) => Promise<void>;
    }> {
      const camera = fakePublication("video");
      camera.track$.next(fakeTrack("video", settings));
      local.publications$.next([camera]);
      const connection = create();
      await settle();
      connection.handle(answer());
      await settle();
      const control = lastPeerConnection().control();
      control.open();
      return {
        camera,
        consume: async (metadata): Promise<void> => {
          control.receive({
            type: "consumption_metadata",
            consumption_metadata: metadata,
          });
          await settle();
        },
      };
    }

    it("stops sending a track that isn't in use, without renegotiating", async () => {
      const { camera, consume } = await sendingCamera();
      const { sender } = lastPeerConnection().transceivers[0];
      await consume({ "0": { in_use: false } });
      expect(sender.track).toBeNull();

      await consume({});
      expect(sender.track).toBe(camera.track$.value);
      expect(lastPeerConnection().offers).toBe(1);
    });

    it("scales the video down to the largest size shown", async () => {
      const { consume } = await sendingCamera({ width: 1280, height: 720 });
      const { sender } = lastPeerConnection().transceivers[0];
      await consume({ "0": { max_width: 320, max_height: 320 } });
      expect(sender.parameters.encodings).toEqual([
        { scaleResolutionDownBy: 4 },
      ]);

      // Larger than the camera: sent as it is
      await consume({ "0": { max_width: 4000, max_height: 4000 } });
      expect(sender.parameters.encodings).toEqual([
        { scaleResolutionDownBy: 1 },
      ]);
    });
  });

  it("sends data once the data channel is open", () => {
    const connection = create();
    expect(connection.sendData("early")).toBe(false);
    const data = lastPeerConnection().dataChannels[1];
    data.open();
    expect(connection.sendData("hello")).toBe(true);
    expect(data.sent).toEqual(["hello"]);
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
