/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { observeParticipantEvents } from "@livekit/components-core";
import {
  type LocalParticipant,
  type LocalTrackPublication,
  ParticipantEvent,
  type Room as LivekitRoom,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  NEVER,
  type Observable,
  of,
  switchMap,
} from "rxjs";

import {
  type LocalAudioMediaTrack,
  type LocalMediaInputs,
  type LocalMemberMedia,
  type LocalVideoMediaTrack,
  type MediaSource,
  type PublishRequest,
} from "../../api";
import { type EncryptionSystem } from "../../encryption";
import { FailToStartLivekitConnection, toMatrixRTCError } from "../../errors";
import { type Behavior } from "../../reactive/Behavior";
import { type ObservableScope } from "../../reactive/ObservableScope";
import { mapScoped } from "../../utils/mapScoped";
import { type LocalMediaBackend, MediaConnectionState } from "../api";
import { type Connection } from "./Connection";
import {
  type IConnectionManager,
  type LocalTransport,
} from "./ConnectionManager";
import { createLocalLivekitMemberMedia } from "./LivekitMemberMedia";
import { livekitSources } from "./LivekitMediaTrack";
import { type DesiredMedia, Publisher } from "./Publisher";
import { toMediaConnectionState } from "./connectionState";

interface Props {
  scope: ObservableScope;
  connectionManager: IConnectionManager;
  localTransport$: Observable<LocalTransport>;
  localMedia: LocalMediaInputs;
  encryptionSystem: EncryptionSystem;
  logger: Logger;
}

export interface LivekitLocalMedia extends LocalMediaBackend {
  /** The connection the local member publishes on; the data channel sends on it. */
  connection$: Behavior<Connection | null>;
}

/**
 * The local member's side of the LiveKit backend: one `Publisher` per
 * connection to the local transport, driven by the publish intent and the
 * requests the host made, both of which outlive any one connection.
 */
export function createLivekitLocalMedia({
  scope,
  connectionManager,
  localTransport$,
  localMedia,
  encryptionSystem,
  logger: parentLogger,
}: Props): LivekitLocalMedia {
  const logger = parentLogger.getChild("[LocalMedia]");

  const connection$ = scope.behavior(
    combineLatest([
      connectionManager.connectionManagerData$,
      localTransport$,
    ]).pipe(
      map(([{ value: connections }, { transport }]) =>
        connections.getConnectionForTransport(transport),
      ),
    ),
    null,
  );

  const connectionState$ = scope.behavior<MediaConnectionState | Error>(
    connection$.pipe(
      switchMap(
        (connection) =>
          connection?.state$.pipe(map(toMediaConnectionState)) ??
          of(MediaConnectionState.Initialized),
      ),
    ),
  );

  const desired: DesiredMedia = new Map(
    localMedia.publish.map((request) => [
      request.source,
      { request, enabled: true },
    ]),
  );
  const publishing$ = new BehaviorSubject(false);
  const publisher$ = new BehaviorSubject<Publisher | null>(null);
  const publishError$ = new BehaviorSubject<Error | null>(null);

  scope.reconcile(connection$, async (connection) => {
    if (connection === null) return;
    const publisher = new Publisher(
      connection.livekitRoom,
      localMedia,
      desired,
      logger.getChild(
        `[Publisher ${connection.transport.livekit_service_url}]`,
      ),
    );
    publisher$.next(publisher);
    return Promise.resolve(async (): Promise<void> => {
      publisher$.next(null);
      await publisher.destroy();
    });
  });

  scope.reconcile(
    scope.behavior(combineLatest([publisher$, publishing$])),
    async ([publisher, publish]) => {
      if (publisher === null) return;
      try {
        if (publish) {
          publisher.start();
          await publisher.startPublishing();
        } else if (publisher.shouldPublish) await publisher.stopPublishing();
      } catch (e) {
        if (publishError$.value === null)
          publishError$.next(
            new FailToStartLivekitConnection(
              e instanceof Error ? e.message : String(e),
            ),
          );
        else logger.error("Another publish error", e);
      }
    },
  );

  const participant$ = scope.behavior(
    connection$.pipe(map((c) => c?.livekitRoom.localParticipant ?? null)),
  );

  const setEnabled = async (
    source: MediaSource,
    enabled: boolean,
  ): Promise<boolean> => {
    const wanted = desired.get(source);
    if (wanted) wanted.enabled = enabled;
    // Without a publisher the request waits for the tracks to be created
    const publisher = publisher$.value;
    if (publisher === null) return enabled;
    const result = await publisher.setEnabled(source, enabled);
    if (wanted && result !== enabled) wanted.enabled = result;
    return result;
  };

  const media$ = scope.behavior<LocalMemberMedia | null>(
    mapScoped(
      scope,
      participantAndRoom$(scope, participant$, connection$),
      (mediaScope, { participant, room }) =>
        createLocalLivekitMemberMedia(
          mediaScope,
          participant,
          room,
          encryptionSystem,
          setEnabled,
        ),
    ).pipe(map((media) => media ?? null)),
  );

  const publish = async (
    request: PublishRequest,
  ): Promise<LocalAudioMediaTrack | LocalVideoMediaTrack> => {
    desired.set(request.source, { request, enabled: true });
    const publisher = publisher$.value;
    try {
      // Before the start, the publisher publishes everything desired itself
      const publication =
        (publisher?.started ? await publisher.publish(request) : undefined) ??
        (await firstValueFrom(publication$(participant$, request.source)));
      return await firstValueFrom(trackWithId$(media$, publication.trackSid));
    } catch (e) {
      desired.delete(request.source);
      throw toMatrixRTCError(e);
    }
  };

  const unpublish = async (id: string): Promise<void> => {
    const track = media$.value?.tracks$.value.find((t) => t.id === id);
    if (track === undefined) return;
    // The screen share audio goes with its video
    const source =
      track.source === "screenShareAudio" ? "screenShare" : track.source;
    desired.delete(source);
    await publisher$.value?.unpublish(source);
  };

  return {
    connection$,
    connectionState$,
    media$,
    setPublishing: (publish) => publishing$.next(publish),
    publishError$,
    publish,
    unpublish,
  };
}

/** The pair a `MemberMedia` is built on, changing only when one of the two does. */
function participantAndRoom$(
  scope: ObservableScope,
  participant$: Behavior<LocalParticipant | null>,
  connection$: Behavior<Connection | null>,
): Behavior<{ participant: LocalParticipant; room: LivekitRoom } | null> {
  return scope.behavior(
    combineLatest([participant$, connection$]).pipe(
      map(([participant, connection]) =>
        participant && connection
          ? { participant, room: connection.livekitRoom }
          : null,
      ),
      distinctUntilChanged(
        (a, b) => a?.participant === b?.participant && a?.room === b?.room,
      ),
    ),
  );
}

/** The publication of a source, once the current participant has made it. */
function publication$(
  participant$: Behavior<LocalParticipant | null>,
  source: MediaSource,
): Observable<LocalTrackPublication> {
  return participant$.pipe(
    switchMap((participant) =>
      participant === null
        ? NEVER
        : observeParticipantEvents(
            participant,
            ParticipantEvent.LocalTrackPublished,
          ).pipe(
            map(() => participant.getTrackPublication(livekitSources[source])),
          ),
    ),
    filter((publication) => publication !== undefined),
  );
}

function trackWithId$(
  media$: Behavior<LocalMemberMedia | null>,
  id: string,
): Observable<LocalAudioMediaTrack | LocalVideoMediaTrack> {
  return media$.pipe(
    switchMap((media) => media?.tracks$ ?? of([])),
    map((tracks) => tracks.find((track) => track.id === id)),
    filter((track) => track !== undefined),
  );
}
