/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  ConnectionState as LivekitConnectionState,
  type LocalDataTrack as LivekitLocalDataTrack,
  type LocalParticipant,
} from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  first,
  map,
  type Observable,
  of,
  startWith,
  Subject,
  switchMap,
} from "rxjs";

import { type DataPublishRequest, type LocalDataTrack } from "../../media-api";
import { type Behavior } from "../../reactive/Behavior";
import { ObservableScope } from "../../reactive/ObservableScope";
import { type Connection } from "./Connection";
import { toLivekitDataTrackName } from "./dataTrackName";

interface Props {
  scope: ObservableScope;
  /** The connection the local member publishes on. */
  connection$: Behavior<Connection | null>;
  /** Whether anything may leave this device: joined and the homeserver reachable. */
  publishing$: Observable<boolean>;
  /** Whether the rooms carry a key provider, so LiveKit encrypts what we send. */
  encrypted: boolean;
  logger: Logger;
}

export interface LocalDataTracks {
  tracks$: Behavior<LocalDataTrack[]>;
  /**
   * Resolves once the track is published on LiveKit, which waits for the
   * join. Rejects where a track of that name is published already, or where
   * LiveKit refuses it.
   */
  publish(request: DataPublishRequest): Promise<LocalDataTrack>;
  unpublish(track: LocalDataTrack): void;
}

interface Published {
  track: LivekitLocalDataTrack;
  participant: LocalParticipant;
}

interface Entry {
  track: LocalDataTrack;
  finish: () => void;
}

/**
 * The local member's data tracks. Each is one LiveKit data track, published
 * on every connection to the local transport while publishing is allowed, so
 * a track requested before the join goes out once we are joined. The object a
 * host holds outlives the connections. Encryption is LiveKit's: its E2EE
 * manager encrypts with our current key and writes the key index and IV into
 * each frame, or each stream for a reliable track.
 */
export function createLocalDataTracks({
  scope,
  connection$,
  publishing$,
  encrypted,
  logger,
}: Props): LocalDataTracks {
  const entries = new Map<string, Entry>();
  const tracks$ = new BehaviorSubject<LocalDataTrack[]>([]);
  const update = (): void =>
    tracks$.next([...entries.values()].map(({ track }) => track));
  scope.onEnd(() => {
    for (const entry of entries.values()) entry.finish();
  });

  // Where to publish: the local connection once it has connected, while
  // publishing is allowed
  const target$ = scope.behavior(
    combineLatest([connection$, publishing$]).pipe(
      switchMap(([connection, publishing]) =>
        connection === null || !publishing
          ? of(null)
          : connection.state$.pipe(
              first(
                (s) =>
                  s.state === "authenticated" &&
                  s.livekitState === LivekitConnectionState.Connected,
              ),
              map(() => connection),
              startWith(null),
            ),
      ),
      distinctUntilChanged(),
    ),
  );

  const publish = async ({
    name,
    reliable = true,
  }: DataPublishRequest): Promise<LocalDataTrack> => {
    if (entries.has(name))
      throw new Error(`A data track named ${name} is published already`);
    const firstPublished = Promise.withResolvers<void>();
    const livekitName = toLivekitDataTrackName(name, reliable);
    const trackScope = new ObservableScope();
    const published$ = new BehaviorSubject<Published | null>(null);
    const sent$ = new Subject<Uint8Array>();
    let finished = false;

    trackScope.reconcile(target$, async (connection) => {
      if (connection === null) return;
      const participant = connection.livekitRoom.localParticipant;
      let track: LivekitLocalDataTrack;
      try {
        track = await participant.publishDataTrack({ name: livekitName });
      } catch (e) {
        logger.error(`Failed to publish the data track ${name}`, e);
        firstPublished.reject(e);
        return;
      }
      published$.next({ track, participant });
      firstPublished.resolve();
      return async (): Promise<void> => {
        published$.next(null);
        await track.unpublish().catch((e: unknown) => {
          logger.warn(`Failed to unpublish the data track ${name}`, e);
        });
      };
    });

    const track: LocalDataTrack = {
      source: "data",
      kind: "data",
      id: `data:${name}`,
      name,
      reliable,
      encrypted,
      data$: sent$.asObservable(),
      send: async (payload): Promise<void> => {
        if (finished) throw new Error(`The data track ${name} is unpublished`);
        const published = published$.value;
        if (published === null)
          throw new Error(
            `Cannot send on ${name}: not published on the transport yet`,
          );
        if (reliable)
          await published.participant.sendBytes(payload, {
            topic: livekitName,
          });
        else
          await published.track.tryPush({ payload: new Uint8Array(payload) });
        sent$.next(payload);
      },
    };

    entries.set(name, {
      track,
      finish: (): void => {
        finished = true;
        trackScope.end();
        sent$.complete();
      },
    });
    update();
    try {
      await firstPublished.promise;
    } catch (e) {
      unpublish(track);
      throw e;
    }
    return track;
  };

  const unpublish = (track: LocalDataTrack): void => {
    const entry = entries.get(track.name);
    if (entry?.track !== track) return;
    entries.delete(track.name);
    entry.finish();
    update();
  };

  return { tracks$: scope.behavior(tracks$), publish, unpublish };
}
