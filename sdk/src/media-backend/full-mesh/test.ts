/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Fakes for the parts of WebRTC that jsdom lacks, and for the signalling, so
 * that the full mesh connections can run in unit tests.
 */

import { vi } from "vitest";
import { BehaviorSubject, Subject } from "rxjs";

import { CONTROL_CHANNEL_LABEL } from "./ControlChannel";
import { type LocalPublication } from "./LocalMedia";
import { type StreamMetadata } from "./metadata";
import {
  type ConnectionMessage,
  type Peer,
  type Signalling,
  type SignallingMessage,
  type SignallingPayload,
} from "./signalling";

let nextId = 0;

export class FakeMediaStream {
  public readonly id: string;
  public constructor(public readonly tracks: MediaStreamTrack[] = []) {
    this.id = `stream-${nextId++}`;
  }
  public getTracks(): MediaStreamTrack[] {
    return this.tracks;
  }
}

export function fakeTrack(
  kind: "audio" | "video",
  settings: MediaTrackSettings = {},
): MediaStreamTrack {
  return {
    id: `track-${nextId++}`,
    kind,
    enabled: true,
    stop: vi.fn(),
    getSettings: () => settings,
  } as unknown as MediaStreamTrack;
}

/** A data channel whose opening and incoming messages the test drives. */
export class FakeDataChannel extends EventTarget {
  public readyState: RTCDataChannelState = "connecting";
  public readonly sent: string[] = [];

  public constructor(
    public readonly label: string,
    public readonly init: RTCDataChannelInit = {},
  ) {
    super();
  }

  public send(data: string): void {
    if (this.readyState !== "open") throw new Error("The channel isn't open");
    this.sent.push(data);
  }

  /** What was sent, parsed. */
  public sentMessages(): unknown[] {
    return this.sent.map((data) => JSON.parse(data) as unknown);
  }

  public open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }

  public close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }

  /** A message from the peer; an object is sent as JSON. */
  public receive(data: unknown): void {
    this.dispatchEvent(
      Object.assign(new Event("message"), {
        data: typeof data === "string" ? data : JSON.stringify(data),
      }),
    );
  }
}

interface FakeTransceiver {
  kind: string;
  mid: string;
  direction: RTCRtpTransceiverDirection;
  currentDirection: RTCRtpTransceiverDirection | null;
  streams: MediaStream[];
  stopped: boolean;
  stop(): void;
  sender: {
    track: MediaStreamTrack | null;
    replaceTrack: ReturnType<typeof vi.fn>;
    parameters: RTCRtpSendParameters;
    getParameters(): RTCRtpSendParameters;
    setParameters: ReturnType<typeof vi.fn>;
  };
  receiver: { track: MediaStreamTrack };
}

/** Enough of `RTCPeerConnection` for one side of a connection, driven by the test. */
export class FakePeerConnection extends EventTarget {
  public static instances: FakePeerConnection[] = [];

  public signalingState: RTCSignalingState = "stable";
  public connectionState: RTCPeerConnectionState = "new";
  public iceConnectionState: RTCIceConnectionState = "new";
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public readonly transceivers: FakeTransceiver[] = [];
  public readonly addedCandidates: RTCIceCandidateInit[] = [];
  public readonly dataChannels: FakeDataChannel[] = [];
  public offers = 0;
  public closed = false;

  public constructor(public readonly config: RTCConfiguration) {
    super();
    FakePeerConnection.instances.push(this);
  }

  public addTransceiver(
    kind: string,
    init: RTCRtpTransceiverInit,
  ): FakeTransceiver {
    const transceiver: FakeTransceiver = {
      kind,
      mid: String(this.transceivers.length),
      direction: init.direction ?? "sendrecv",
      currentDirection: null,
      streams: init.streams ?? [],
      stopped: false,
      stop(): void {
        this.stopped = true;
      },
      sender: {
        track: null,
        replaceTrack: vi.fn(async (track: MediaStreamTrack | null) => {
          transceiver.sender.track = track;
          return Promise.resolve();
        }),
        parameters: {
          encodings: [{}],
        } as unknown as RTCRtpSendParameters,
        getParameters: (): RTCRtpSendParameters =>
          structuredClone(transceiver.sender.parameters),
        setParameters: vi.fn(async (parameters: RTCRtpSendParameters) => {
          transceiver.sender.parameters = parameters;
          return Promise.resolve();
        }),
      },
      receiver: { track: fakeTrack(kind === "audio" ? "audio" : "video") },
    };
    this.transceivers.push(transceiver);
    return transceiver;
  }

  public createDataChannel(
    label: string,
    init?: RTCDataChannelInit,
  ): FakeDataChannel {
    const channel = new FakeDataChannel(label, init);
    this.dataChannels.push(channel);
    return channel;
  }

  /** Our side of the control channel. */
  public control(): FakeDataChannel {
    const channel = this.dataChannels.find(
      (c) => c.label === CONTROL_CHANNEL_LABEL,
    );
    if (channel === undefined) throw new Error("No control channel");
    return channel;
  }

  /** A data channel the remote side created, as `ondatachannel` brings it. */
  public announceDataChannel(label: string): FakeDataChannel {
    const channel = new FakeDataChannel(label);
    this.dispatchEvent(Object.assign(new Event("datachannel"), { channel }));
    return channel;
  }

  public getTransceivers(): FakeTransceiver[] {
    return this.transceivers;
  }

  public getSenders(): FakeTransceiver["sender"][] {
    return this.transceivers.map((t) => t.sender);
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "offer", sdp: `offer-${++this.offers}` });
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "answer", sdp: "answer" });
  }

  public async setLocalDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.localDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-local-offer" : "stable";
    return Promise.resolve();
  }

  public async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.remoteDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-remote-offer" : "stable";
    return Promise.resolve();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (candidate.candidate === "bad")
      return Promise.reject(new Error("bad candidate"));
    this.addedCandidates.push(candidate);
    return Promise.resolve();
  }

  public async getStats(): Promise<RTCStatsReport> {
    return Promise.resolve(new Map() as unknown as RTCStatsReport);
  }

  public close(): void {
    this.closed = true;
    this.signalingState = "closed";
    this.connectionState = "closed";
    for (const channel of this.dataChannels) channel.close();
  }

  /** Gathers a local candidate; null ends the gathering. */
  public gather(candidate: RTCIceCandidateInit | null): void {
    this.dispatchEvent(
      Object.assign(new Event("icecandidate"), {
        candidate: candidate && { toJSON: () => candidate },
      }),
    );
  }

  public setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.dispatchEvent(new Event("connectionstatechange"));
  }

  /** A track the remote side sends, as the next negotiation would bring it. */
  public receive(kind: "audio" | "video", streamId: string): FakeTransceiver {
    const transceiver = this.addTransceiver(kind, { direction: "recvonly" });
    transceiver.currentDirection = "recvonly";
    this.dispatchEvent(
      Object.assign(new Event("track"), {
        track: transceiver.receiver.track,
        streams: [{ id: streamId }],
      }),
    );
    return transceiver;
  }
}

class FakeAudioContext {
  public destination = {};
  public createMediaStreamSource(): object {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  public createAnalyser(): object {
    return {
      fftSize: 512,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getFloatTimeDomainData: (samples: Float32Array): void => {
        samples.fill(0);
      },
    };
  }
  public createGain(): object {
    return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  }
}

/** Replaces the WebRTC and Web Audio globals jsdom doesn't have. Undo with `vi.unstubAllGlobals()`. */
export function installWebRtcFakes(): void {
  FakePeerConnection.instances = [];
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("AudioContext", FakeAudioContext);
}

/** The last peer connection created. */
export function lastPeerConnection(): FakePeerConnection {
  const pc = FakePeerConnection.instances.at(-1);
  if (pc === undefined) throw new Error("No peer connection was created");
  return pc;
}

/** Lets every queued signalling operation run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

export const peer: Peer = {
  userId: "@peer:example.org",
  deviceId: "PEERDEVICE",
  memberId: "peerMember",
};

export interface FakeSignalling extends Signalling {
  send: ReturnType<typeof vi.fn<Signalling["send"]>>;
  messages$: Subject<SignallingMessage>;
  /** The payloads sent so far, optionally only those of one type. */
  sent(type?: string): SignallingPayload[];
  /** The connection ids sent with the payloads, in the same order. */
  sentConnectionIds(type?: string): string[];
}

export function fakeSignalling(): FakeSignalling {
  const send = vi.fn<Signalling["send"]>();
  const calls = (type?: string): Parameters<Signalling["send"]>[] =>
    send.mock.calls.filter(([, , p]) => type === undefined || p.type === type);
  return {
    send,
    messages$: new Subject(),
    sent: (type) => calls(type).map(([, , p]) => p),
    sentConnectionIds: (type) => calls(type).map(([, id]) => id),
  };
}

/** A to-device message of a connection, as signalling delivers it. */
export type PeerMessage = ConnectionMessage & Omit<SignallingMessage, "type">;

/** A to-device message from `peer` on a connection. */
export function fromPeer<P extends SignallingPayload>(
  connectionId: string,
  payload: P,
): P & Omit<SignallingMessage, "type"> {
  return { ...payload, ...peer, connectionId };
}

/** The local media a publisher connection reads. */
export function fakeLocalMedia(): {
  publications$: BehaviorSubject<LocalPublication[]>;
  publishing$: BehaviorSubject<boolean>;
  streamMetadata$: BehaviorSubject<StreamMetadata>;
} {
  return {
    publications$: new BehaviorSubject<LocalPublication[]>([]),
    publishing$: new BehaviorSubject(true),
    streamMetadata$: new BehaviorSubject<StreamMetadata>({}),
  };
}

export function fakePublication(
  kind: "audio" | "video",
  stream = new FakeMediaStream() as unknown as MediaStream,
): LocalPublication & { track$: BehaviorSubject<MediaStreamTrack | null> } {
  return {
    source: kind === "audio" ? "microphone" : "camera",
    kind,
    stream,
    track$: new BehaviorSubject<MediaStreamTrack | null>(fakeTrack(kind)),
    mediaTrack: {} as LocalPublication["mediaTrack"],
  };
}
