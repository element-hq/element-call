// TODO-MULTI-SFU Add all device syncing logic from useLivekit
/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { connectedParticipantsObserver } from "@livekit/components-core";
import {
  type Room as LivekitRoom,
  type RemoteParticipant,
} from "livekit-client";
import { type MatrixClient } from "matrix-js-sdk";
import {
  type LivekitFocus,
  type CallMembership,
} from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, type Observable } from "rxjs";

import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { type ObservableScope } from "./ObservableScope";

export class Connection {
  protected readonly sfuConfig = getSFUConfigWithOpenID(
    this.client,
    this.focus.livekit_service_url,
    this.livekitAlias,
  );

  public async start(): Promise<void> {
    this.stopped = false;
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);
  }

  protected stopped = false;

  public stop(): void {
    void this.livekitRoom.disconnect();
    this.stopped = true;
  }

  public readonly participantsIncludingSubscribers$ = this.scope.behavior(
    connectedParticipantsObserver(this.livekitRoom),
    [],
  );

  public readonly publishingParticipants$: Observable<RemoteParticipant[]> =
    this.scope.behavior(
      combineLatest([
        connectedParticipantsObserver(this.livekitRoom),
        this.membershipsFocusMap$,
      ]).pipe(
        map(([participants, membershipsFocusMap]) =>
          membershipsFocusMap
            // Find all members that claim to publish on this connection
            .flatMap(({ membership, focus }) =>
              focus.livekit_service_url === this.focus.livekit_service_url
                ? [membership]
                : [],
            )
            // Find all associated publishing livekit participant objects
            .flatMap(({ sender, deviceId }) => {
              const participant = participants.find(
                (p) => p.identity === `${sender}:${deviceId}`,
              );
              return participant ? [participant] : [];
            }),
        ),
      ),
      [],
    );

  public constructor(
    protected readonly livekitRoom: LivekitRoom,
    protected readonly focus: LivekitFocus,
    protected readonly livekitAlias: string,
    protected readonly client: MatrixClient,
    protected readonly scope: ObservableScope,
    protected readonly membershipsFocusMap$: Behavior<
      { membership: CallMembership; focus: LivekitFocus }[]
    >,
  ) {}
}

export class PublishConnection extends Connection {
  public async start(): Promise<void> {
    this.stopped = false;
    const { url, jwt } = await this.sfuConfig;
    if (!this.stopped) await this.livekitRoom.connect(url, jwt);

    if (!this.stopped) {
      const tracks = await this.livekitRoom.localParticipant.createTracks({
        audio: true,
        video: true,
      });
      for (const track of tracks) {
        await this.livekitRoom.localParticipant.publishTrack(track);
      }
    }
  }

  public stop(): void {
    void this.livekitRoom.disconnect();
    this.stopped = true;
  }

  public readonly participantsIncludingSubscribers$ = this.scope.behavior(
    connectedParticipantsObserver(this.livekitRoom),
    [],
  );
}
