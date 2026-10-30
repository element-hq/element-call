/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** What the publisher and the subscriber side of a connection share. */

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  fromEvent,
  map,
  startWith,
} from "rxjs";

import { type Behavior } from "../../reactive/Behavior";
import { type ObservableScope } from "../../reactive/ObservableScope";
import { MediaConnectionState } from "../api";
import {
  type ControlMessage,
  createControlChannel,
  parseControlMessage,
} from "./ControlChannel";
import { type Peer, type Signalling } from "./signalling";

/** How long trickled candidates are collected before they are sent in one message. */
export const CANDIDATE_BATCH_MS = 200;

type MetadataMessage = Extract<
  ControlMessage,
  { type: "stream_metadata" | "consumption_metadata" }
>;

export interface PeerConnectionBase {
  readonly connectionId: string;
  readonly pc: RTCPeerConnection;
  readonly state$: Behavior<MediaConnectionState | Error>;
  /** Runs `op` after every operation queued before it, so that SDP and candidates apply in order. */
  enqueue(op: () => Promise<void>): void;
  /**
   * Creates our side of the control channel. The publisher does so before
   * its first offer, the subscriber once it applied that offer.
   */
  openControlChannel(): void;
  /**
   * Sends a message to the peer: over the control channel once it is open,
   * before that as a to-device message. Metadata has no to-device message of
   * its own: the latest waits for the channel, the initial one goes with the
   * first offer and answer.
   */
  send(message: ControlMessage): void;
  /** Applies a received batch of candidates. */
  addCandidates(candidates: RTCIceCandidateInit[]): void;
  /** Closes the peer connection, telling the peer unless it closed first. */
  close(reason: string | undefined, notifyPeer: boolean): void;
}

export function createPeerConnectionBase({
  scope,
  peer,
  connectionId,
  signalling,
  iceServers,
  onControlMessage,
  logger,
}: {
  scope: ObservableScope;
  peer: Peer;
  connectionId: string;
  signalling: Signalling;
  iceServers: RTCIceServer[];
  /** A message the peer sent over the control channel. */
  onControlMessage: (message: ControlMessage) => void;
  logger: Logger;
}): PeerConnectionBase {
  const pc = new RTCPeerConnection({ iceServers });
  const closed$ = new BehaviorSubject(false);
  const controlFailed$ = new BehaviorSubject(false);

  let queue = Promise.resolve();
  const enqueue = (op: () => Promise<void>): void => {
    queue = queue.then(op).catch((e: unknown) => {
      logger.warn("Signalling operation failed", e);
    });
  };

  let control: RTCDataChannel | null = null;
  const pendingMetadata = new Map<MetadataMessage["type"], MetadataMessage>();
  const openControlChannel = (): void => {
    if (control !== null) return;
    const channel = createControlChannel(pc);
    control = channel;
    channel.addEventListener("open", () => {
      logger.debug("Control channel open");
      for (const message of pendingMetadata.values())
        channel.send(JSON.stringify(message));
      pendingMetadata.clear();
    });
    channel.addEventListener("message", ({ data }: MessageEvent) => {
      const message = parseControlMessage(data);
      if (message === null) logger.debug("Ignoring a control message", data);
      else onControlMessage(message);
    });
    // Ours to close only with the connection: closing otherwise is a failure
    channel.addEventListener("close", () => {
      if (!closed$.value) controlFailed$.next(true);
    });
  };

  const send = (message: ControlMessage): void => {
    if (closed$.value) return;
    if (control?.readyState === "open") control.send(JSON.stringify(message));
    else if (
      message.type === "stream_metadata" ||
      message.type === "consumption_metadata"
    )
      pendingMetadata.set(message.type, message);
    else signalling.send(peer, connectionId, message);
  };

  // Trickled, in batches
  let pending: RTCIceCandidateInit[] = [];
  let batchTimer: ReturnType<typeof setTimeout> | undefined;
  const flushCandidates = (): void => {
    batchTimer = undefined;
    if (pending.length === 0) return;
    send({ type: "candidates", candidates: pending });
    pending = [];
  };
  pc.addEventListener("icecandidate", ({ candidate }) => {
    // A null candidate ends the gathering: an empty one says so on the wire
    pending.push(
      candidate
        ? candidate.toJSON()
        : { candidate: "", sdpMid: null, sdpMLineIndex: null },
    );
    batchTimer ??= setTimeout(flushCandidates, CANDIDATE_BATCH_MS);
  });

  const addCandidates: PeerConnectionBase["addCandidates"] = (candidates) =>
    enqueue(async () => {
      for (const candidate of candidates)
        await pc
          .addIceCandidate(candidate)
          // A candidate of an outdated description, or a bad one: not fatal
          .catch((e: unknown) => logger.debug("Ignored a candidate", e));
    });

  const close: PeerConnectionBase["close"] = (reason, notifyPeer) => {
    if (closed$.value) return;
    clearTimeout(batchTimer);
    // Always to-device: closing the peer connection would race a channel message
    if (notifyPeer)
      signalling.send(peer, connectionId, { type: "close", reason });
    closed$.next(true);
    pc.close();
  };
  scope.onEnd(() => close("ended", true));

  const state$ = scope.behavior(
    combineLatest([
      fromEvent(pc, "connectionstatechange").pipe(startWith(null)),
      controlFailed$,
    ]).pipe(
      map(([, controlFailed]) =>
        controlFailed && pc.connectionState !== "closed"
          ? new Error("The control channel closed")
          : toState(pc.connectionState),
      ),
    ),
  );

  return {
    connectionId,
    pc,
    state$,
    enqueue,
    openControlChannel,
    send,
    addCandidates,
    close,
  };
}

function toState(state: RTCPeerConnectionState): MediaConnectionState | Error {
  switch (state) {
    case "new":
      return MediaConnectionState.Initialized;
    case "connecting":
      return MediaConnectionState.Connecting;
    case "connected":
      return MediaConnectionState.Connected;
    case "disconnected":
      return MediaConnectionState.Reconnecting;
    case "failed":
      return new Error("The peer connection failed");
    case "closed":
      return MediaConnectionState.Stopped;
  }
}
