/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import { type MediaTrack } from "../api";
import { testScope } from "./test";
import { trackBySource$ } from "./tracks";

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
