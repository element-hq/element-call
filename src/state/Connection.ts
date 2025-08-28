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
  type CallMembership,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { combineLatest, map, type Observable } from "rxjs";

import { getSFUConfigWithOpenID } from "../livekit/openIDSFU";
import { type Behavior } from "./Behavior";
import { membershipsFocusUrl } from "./CallViewModel";
import { type ObservableScope } from "./ObservableScope";

export class Connection {
  protected readonly sfuConfig = getSFUConfigWithOpenID(
    this.client,
    this.serviceUrl,
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

  public readonly publishingParticipants$ = (
    memberships$: Behavior<CallMembership[]>,
  ): Observable<RemoteParticipant[]> =>
    this.scope.behavior(
      combineLatest([
        connectedParticipantsObserver(this.livekitRoom),
        memberships$,
      ]).pipe(
        map(([participants, memberships]) => {
          const publishingMembers = membershipsFocusUrl(
            memberships,
            this.matrixRTCSession,
          )
            .filter((f) => f.livekit_service_url === this.serviceUrl)
            .map((f) => f.membership);

          const publishingP = publishingMembers
            .map((m) => {
              return participants.find((p) => {
                return p.identity === `${m.sender}:${m.deviceId}`;
              });
            })
            .filter((p): p is RemoteParticipant => !!p);
          return publishingP;
        }),
      ),
      [],
    );

  public constructor(
    protected readonly livekitRoom: LivekitRoom,
    protected readonly serviceUrl: string,
    protected readonly livekitAlias: string,
    protected readonly client: MatrixClient,
    protected readonly scope: ObservableScope,
    protected readonly matrixRTCSession: MatrixRTCSession,
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
