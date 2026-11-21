/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import { type DataTrack, type MediaTrack } from "../media-api";
import { testScope } from "./test";
import { dataTrackByName$, trackBySource$ } from "./tracks";

const camera = { source: "camera", kind: "video", id: "1" } as MediaTrack;
const microphone = {
  source: "microphone",
  kind: "audio",
  id: "2",
} as MediaTrack;

describe("trackBySource$", () => {
  it("picks the track of a source and follows the list", () => {
    const tracks$ = new BehaviorSubject<MediaTrack[]>([]);
    const camera$ = trackBySource$(testScope(), tracks$, "camera");
    expect(camera$.value).toBeUndefined();
    tracks$.next([microphone, camera]);
    expect(camera$.value).toBe(camera);
    tracks$.next([microphone]);
    expect(camera$.value).toBeUndefined();
  });

  it("does not emit when the list changes elsewhere", () => {
    const tracks$ = new BehaviorSubject<MediaTrack[]>([camera]);
    const camera$ = trackBySource$(testScope(), tracks$, "camera");
    const emissions: unknown[] = [];
    camera$.subscribe((t) => emissions.push(t));
    tracks$.next([camera, microphone]);
    expect(emissions).toEqual([camera]);
  });
});

const chat = {
  source: "data",
  kind: "data",
  id: "3",
  name: "chat",
} as DataTrack;
const cursors = {
  source: "data",
  kind: "data",
  id: "4",
  name: "cursors",
} as DataTrack;

describe("dataTrackByName$", () => {
  it("picks the data track of a name and follows the list", () => {
    const tracks$ = new BehaviorSubject<(MediaTrack | DataTrack)[] | null>(
      null,
    );
    const chat$ = dataTrackByName$(testScope(), tracks$, "chat");
    expect(chat$.value).toBeUndefined();
    tracks$.next([camera, cursors, chat]);
    expect(chat$.value).toBe(chat);
    tracks$.next([camera, cursors]);
    expect(chat$.value).toBeUndefined();
  });

  it("does not emit when the list changes elsewhere", () => {
    const tracks$ = new BehaviorSubject<(MediaTrack | DataTrack)[]>([chat]);
    const chat$ = dataTrackByName$(testScope(), tracks$, "chat");
    const emissions: unknown[] = [];
    chat$.subscribe((t) => emissions.push(t));
    tracks$.next([chat, camera]);
    tracks$.next([microphone, chat, cursors]);
    expect(emissions).toEqual([chat]);
  });
});
