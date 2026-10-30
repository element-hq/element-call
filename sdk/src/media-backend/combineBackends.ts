/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { combineLatest, map, merge, NEVER, of, switchMap } from "rxjs";

import { type RTCMember } from "../api";
import { MatrixRTCError } from "../errors";
import { type MemberMedia } from "../media-api";
import { type ObservableScope } from "../reactive/ObservableScope";
import { mapScoped } from "../utils/mapScoped";
import { type MediaBackend } from "./api";

/**
 * Several backends as one: we publish on the backend of `publishType`, and
 * receive from every member on a transport any of the backends serves. A
 * member is handed to the backend of its current transport type. A backend
 * nobody is on costs nothing: it connects only for the members handed to it.
 */
export function combineBackends(
  scope: ObservableScope,
  all: MediaBackend[],
  publishType: string,
): MediaBackend {
  const byType = new Map(all.map((b) => [b.transportType, b]));
  const publish = byType.get(publishType);
  if (publish === undefined)
    throw new MatrixRTCError(`No media backend for transport ${publishType}`);

  const mediaFor = (
    memberScope: ObservableScope,
    member: RTCMember,
  ): MemberMedia => {
    // The publishing backend sees every member, whatever its transport, so
    // that it can tell members from strangers when a backend is asked for our
    // media by members on other transports. It connects nowhere for them
    const publishMedia = publish.mediaFor(memberScope, member);
    const type$ = memberScope.behavior(
      member.transport$.pipe(map((transport) => transport?.type)),
    );
    const media$ = mapScoped(memberScope, type$, (s, type) =>
      type === publish.transportType
        ? publishMedia
        : byType.get(type)?.mediaFor(s, member),
    );
    return {
      tracks$: memberScope.behavior(
        media$.pipe(switchMap((media) => media?.tracks$ ?? of(null))),
      ),
      encryptionError$: media$.pipe(
        switchMap((media) => media?.encryptionError$ ?? NEVER),
      ),
    };
  };

  return {
    transportType: publish.transportType,
    prepareLocalTransport: async (transport) =>
      publish.prepareLocalTransport(transport),
    delegateDelayedLeave: async (delayId) =>
      publish.delegateDelayedLeave(delayId),
    local: publish.local,
    mediaFor,
    connections$: scope.behavior(
      combineLatest(all.map((b) => b.connections$)).pipe(
        map((lists) => lists.flat()),
      ),
    ),
    setAudioOutputDeviceId: async (deviceId) => {
      await Promise.all(
        all.map(async (b) => b.setAudioOutputDeviceId(deviceId)),
      );
    },
    sendData: async (topic, text) => publish.sendData(topic, text),
    data$: merge(...all.map((b) => b.data$)),
  };
}
