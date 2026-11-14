/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { distinctUntilChanged, map } from "rxjs";

import { type Behavior } from "../reactive/Behavior";
import { type ObservableScope } from "../reactive/ObservableScope";
import {
  type AudioMediaTrack,
  type DataTrack,
  type MediaSource,
  type MediaTrack,
  type VideoMediaTrack,
} from "../media-api";

export type TrackOfSource<S extends MediaSource> = S extends
  | "microphone"
  | "screenShareAudio"
  ? AudioMediaTrack
  : S extends "camera" | "screenShare"
    ? VideoMediaTrack
    : AudioMediaTrack | VideoMediaTrack;

/** The member's first track of a source; undefined while there is none, or no media yet. */
export function trackBySource$<S extends MediaSource>(
  scope: ObservableScope,
  tracks$: Behavior<readonly (MediaTrack | DataTrack)[] | null>,
  source: S,
): Behavior<TrackOfSource<S> | undefined> {
  return scope.behavior(
    tracks$.pipe(
      map(
        (tracks) =>
          tracks?.find((t) => t.source === source) as
            | TrackOfSource<S>
            | undefined,
      ),
      distinctUntilChanged(),
    ),
  );
}

/** The member's data track of this name; undefined while there is none, or no media yet. */
export function dataTrackByName$(
  scope: ObservableScope,
  tracks$: Behavior<readonly (MediaTrack | DataTrack)[] | null>,
  name: string,
): Behavior<DataTrack | undefined> {
  return scope.behavior(
    tracks$.pipe(
      map((tracks) =>
        tracks?.find(
          (t): t is DataTrack => t.kind === "data" && t.name === name,
        ),
      ),
      distinctUntilChanged(),
    ),
  );
}
