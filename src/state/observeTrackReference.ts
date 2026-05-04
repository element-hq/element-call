/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  observeParticipantMedia,
  type TrackReference,
} from "@livekit/components-core";
import { type Participant, type Track } from "livekit-client";
import { distinctUntilChanged, map, type Observable } from "rxjs";

/**
 * Reactively reads a participant's track reference for a given media source.
 */
export function observeTrackReference$(
  participant: Participant,
  source: Track.Source,
): Observable<TrackReference | undefined> {
  return observeParticipantMedia(participant).pipe(
    map(() => participant.getTrackPublication(source)),
    distinctUntilChanged(),
    map((publication) => publication && { participant, publication, source }),
  );
}
