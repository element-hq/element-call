/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  merge,
  type Observable,
  skip,
  type Subscription,
  switchMap,
} from "rxjs";

import { type ObservableScope } from "../../reactive/ObservableScope";
import { type FullMeshLocalMedia, type LocalPublication } from "./LocalMedia";
import {
  type ConsumptionMetadata,
  type ConsumptionMetadataEntry,
  DATA_CHANNEL_LABEL,
  DATA_PROTOCOL,
  type MediaPurpose,
  type TrackMetadata,
} from "./metadata";
import {
  createPeerConnectionBase,
  type PeerConnectionBase,
} from "./PeerConnection";
import {
  type ConnectionMessage,
  type Peer,
  type Signalling,
} from "./signalling";

export interface PublisherConnection extends PeerConnectionBase {
  /** A to-device message of this connection from the subscriber. */
  handle(message: ConnectionMessage): void;
  /** Sends one message on the data channel; false while it isn't open. */
  sendData(message: string): boolean;
}

/**
 * Our side of a connection a subscriber asked for: we only send, and we are
 * the only side that makes offers, so there is no glare.
 */
export function createPublisherConnection({
  scope,
  peer,
  connectionId,
  signalling,
  iceServers,
  local,
  logger: parentLogger,
}: {
  scope: ObservableScope;
  peer: Peer;
  connectionId: string;
  signalling: Signalling;
  iceServers: RTCIceServer[];
  local: FullMeshLocalMedia;
  logger: Logger;
}): PublisherConnection {
  const logger = parentLogger.getChild(
    `[Publisher → ${peer.memberId} ${connectionId}]`,
  );
  const base = createPeerConnectionBase({
    scope,
    peer,
    connectionId,
    signalling,
    iceServers,
    onControlMessage: (message) => handle(message),
    logger,
  });
  const { pc, enqueue } = base;
  const consumption$ = new BehaviorSubject<ConsumptionMetadata>({});

  // Both before the first offer, which so has the connection's data section
  base.openControlChannel();
  const data = pc.createDataChannel(DATA_CHANNEL_LABEL, {
    protocol: DATA_PROTOCOL,
  });

  // One sendonly transceiver per publication, for as long as it exists
  const transceivers = new Map<
    LocalPublication,
    { transceiver: RTCRtpTransceiver; tracks: Subscription }
  >();

  /** The metadata of every track with a `mid`, which it gets with the offer that adds it. */
  const trackMetadata = (): TrackMetadata => {
    const metadata: TrackMetadata = {};
    for (const [publication, { transceiver }] of transceivers)
      if (transceiver.mid !== null)
        metadata[transceiver.mid] = {
          purpose: purposeOf(publication),
          muted: publication.mediaTrack.muted$.value,
        };
    return metadata;
  };

  // A new offer has to wait while one is unanswered; changes made meanwhile
  // go out together in the next one
  let offerPending = false;
  let renegotiate = false;
  const negotiate = (): void => {
    if (offerPending) {
      renegotiate = true;
      return;
    }
    offerPending = true;
    renegotiate = false;
    enqueue(async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      base.send({
        type: "description",
        description: { type: "offer", sdp: pc.localDescription!.sdp },
        track_metadata: trackMetadata(),
      });
    });
  };

  scope.onEnd(() => {
    for (const { tracks } of transceivers.values()) tracks.unsubscribe();
  });
  local.publications$.pipe(scope.bind()).subscribe((publications) => {
    let changed = false;
    for (const [publication, { transceiver, tracks }] of transceivers)
      if (!publications.includes(publication)) {
        tracks.unsubscribe();
        if (pc.signalingState !== "closed") transceiver.stop();
        transceivers.delete(publication);
        changed = true;
      }
    for (const publication of publications)
      if (!transceivers.has(publication)) {
        const transceiver = pc.addTransceiver(publication.kind, {
          direction: "sendonly",
          streams: [publication.stream],
        });
        const tracks = sendPublication(transceiver, publication);
        transceivers.set(publication, { transceiver, tracks });
        changed = true;
      }
    if (changed) negotiate();
  });
  // Even without tracks: the subscriber learns that we are there
  if (transceivers.size === 0) negotiate();

  /**
   * Sends the track of a publication as the subscriber wants it. None while
   * we don't publish or it isn't in use: the local preview stays live, and
   * turning it back on needs no renegotiation.
   */
  function sendPublication(
    transceiver: RTCRtpTransceiver,
    publication: LocalPublication,
  ): Subscription {
    const { sender } = transceiver;
    return combineLatest([
      publication.track$,
      local.publishing$,
      consumptionOf(transceiver),
    ]).subscribe(([track, publishing, consumption]) => {
      const inUse = consumption.in_use ?? true;
      void sender
        .replaceTrack(publishing && inUse ? track : null)
        .then(async () => {
          if (publication.kind === "video" && track !== null)
            await constrainVideo(sender, track, consumption);
        })
        .catch((e: unknown) => logger.warn("Could not send a track", e));
    });
  }

  // The mid is only set with the local description
  function consumptionOf(
    transceiver: RTCRtpTransceiver,
  ): Observable<ConsumptionMetadataEntry> {
    return consumption$.pipe(
      map((c) => (transceiver.mid === null ? {} : (c[transceiver.mid] ?? {}))),
      distinctUntilChanged(
        (a, b) =>
          a.in_use === b.in_use &&
          a.max_width === b.max_width &&
          a.max_height === b.max_height,
      ),
    );
  }

  // Mute changes without renegotiating; an offer carries the state at its time
  local.publications$
    .pipe(
      switchMap((ps) =>
        merge(...ps.map((p) => p.mediaTrack.muted$.pipe(skip(1)))),
      ),
      scope.bind(),
    )
    .subscribe(() =>
      base.send({ type: "track_metadata", track_metadata: trackMetadata() }),
    );

  base.state$
    .pipe(
      filter((s) => s instanceof Error),
      scope.bind(),
    )
    .subscribe((e) => {
      // The subscriber retries; a publisher doesn't
      logger.info(`Connection failed: ${e.message}`);
      base.close("failed", true);
      scope.end();
    });

  function handle(message: ConnectionMessage): void {
    switch (message.type) {
      case "description":
        if (message.description.type !== "answer") return;
        enqueue(async () => {
          await pc.setRemoteDescription(message.description);
          base.answerReceived();
          offerPending = false;
          if (renegotiate) negotiate();
        });
        break;
      case "candidates":
        base.addCandidates(message.candidates);
        break;
      case "consumption_metadata":
        consumption$.next(message.consumption_metadata);
        break;
      case "close":
        logger.info(`Closed by the subscriber: ${message.reason}`);
        base.close(message.reason, false);
        scope.end();
        break;
      default:
        logger.debug(`Ignoring ${message.type}`);
    }
  }

  const sendData = (message: string): boolean => {
    if (data.readyState !== "open") return false;
    data.send(message);
    return true;
  };

  return { ...base, handle, sendData };
}

function purposeOf({ source }: LocalPublication): MediaPurpose {
  return source === "microphone" || source === "camera"
    ? "m.usermedia"
    : "m.screenshare";
}

/** Scales the video down to the size the subscriber shows it at. */
async function constrainVideo(
  sender: RTCRtpSender,
  track: MediaStreamTrack,
  { max_width, max_height }: ConsumptionMetadataEntry,
): Promise<void> {
  const parameters = sender.getParameters();
  const [encoding] = parameters.encodings ?? [];
  if (encoding === undefined) return;
  const { width, height } = track.getSettings();
  encoding.scaleResolutionDownBy = Math.max(
    1,
    width && max_width ? width / max_width : 1,
    height && max_height ? height / max_height : 1,
  );
  await sender.setParameters(parameters);
}
