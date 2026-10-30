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
  type Observable,
  skip,
  type Subscription,
} from "rxjs";

import { type ObservableScope } from "../../reactive/ObservableScope";
import { type FullMeshLocalMedia, type LocalPublication } from "./LocalMedia";
import {
  type ConsumptionMetadata,
  type ConsumptionMetadataEntry,
  DATA_PROTOCOL,
  DATA_PURPOSE,
  DATA_STREAM_ID,
  type StreamMetadata,
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
  /** Sends one message on the data stream; false where it isn't open or not in use. */
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
  const data = pc.createDataChannel(DATA_STREAM_ID);

  const streamMetadata$ = scope.behavior(
    local.streamMetadata$.pipe(
      map((media): StreamMetadata => ({
        ...media,
        [DATA_STREAM_ID]: { purpose: DATA_PURPOSE, protocol: DATA_PROTOCOL },
      })),
    ),
  );

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
        stream_metadata: streamMetadata$.value,
      });
    });
  };

  // One sendonly transceiver per publication, for as long as it exists
  const transceivers = new Map<
    LocalPublication,
    { transceiver: RTCRtpTransceiver; tracks: Subscription }
  >();
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
        const tracks = sendPublication(transceiver.sender, publication);
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
    sender: RTCRtpSender,
    publication: LocalPublication,
  ): Subscription {
    return combineLatest([
      publication.track$,
      local.publishing$,
      consumptionOf(publication.stream.id),
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

  function consumptionOf(
    streamId: string,
  ): Observable<ConsumptionMetadataEntry> {
    return consumption$.pipe(
      map((c) => c[streamId] ?? {}),
      distinctUntilChanged(
        (a, b) =>
          a.in_use === b.in_use &&
          a.max_width === b.max_width &&
          a.max_height === b.max_height &&
          a.max_framerate === b.max_framerate,
      ),
    );
  }

  // Changes without renegotiating; an offer carries the state at its time
  streamMetadata$
    .pipe(skip(1), scope.bind())
    .subscribe((metadata) =>
      base.send({ type: "stream_metadata", stream_metadata: metadata }),
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
          if (message.consumption_metadata)
            consumption$.next(message.consumption_metadata);
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
    const inUse = consumption$.value[DATA_STREAM_ID]?.in_use ?? true;
    if (data.readyState !== "open" || !inUse) return false;
    data.send(message);
    return true;
  };

  return { ...base, handle, sendData };
}

/** Scales and slows the video down to what the subscriber shows. */
async function constrainVideo(
  sender: RTCRtpSender,
  track: MediaStreamTrack,
  { max_width, max_height, max_framerate }: ConsumptionMetadataEntry,
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
  if (max_framerate === undefined) delete encoding.maxFramerate;
  else encoding.maxFramerate = max_framerate;
  await sender.setParameters(parameters);
}
