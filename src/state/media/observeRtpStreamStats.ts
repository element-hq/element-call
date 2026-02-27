/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  LocalTrack,
  type Participant,
  RemoteTrack,
  type Track,
} from "livekit-client";
import {
  combineLatest,
  interval,
  type Observable,
  startWith,
  switchMap,
  map,
} from "rxjs";

import { observeTrackReference$ } from "../observeTrackReference";

export function observeRtpStreamStats$(
  participant: Participant,
  source: Track.Source,
  type: "inbound-rtp" | "outbound-rtp",
): Observable<
  RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
> {
  return combineLatest([
    observeTrackReference$(participant, source),
    interval(1000).pipe(startWith(0)),
  ]).pipe(
    switchMap(async ([trackReference]) => {
      const track = trackReference?.publication?.track;
      if (
        !track ||
        !(track instanceof RemoteTrack || track instanceof LocalTrack)
      ) {
        return undefined;
      }
      const report = await track.getRTCStatsReport();
      if (!report) {
        return undefined;
      }

      for (const v of report.values()) {
        if (v.type === type) {
          return v;
        }
      }

      return undefined;
    }),
    startWith(undefined),
  );
}

export function observeInboundRtpStreamStats$(
  participant: Participant,
  source: Track.Source,
): Observable<RTCInboundRtpStreamStats | undefined> {
  return observeRtpStreamStats$(participant, source, "inbound-rtp").pipe(
    map((x) => x as RTCInboundRtpStreamStats | undefined),
  );
}
