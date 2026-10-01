/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The smallest consumer of the SDK: log in, join a room, show every member's
 * camera and play every remote member's microphone, leave. What a host writes,
 * and nothing a host would not.
 */

import { logger } from "matrix-js-sdk/lib/logger";
import { combineLatest, type Observable, of, switchMap } from "rxjs";
import {
  constant,
  createRtcSession,
  E2eeType,
  MatrixRTCMode,
  type MediaTrack,
  ObservableScope,
  type RtcMember,
  type RtcSession,
} from "@element-hq/matrixrtc-sdk";

import { createSession } from "./session";

const form = document.querySelector("form")!;
const status = document.getElementById("status")!;
const members = document.getElementById("members")!;
const leaveButton = document.getElementById("leave") as HTMLButtonElement;

// So that a test, or a bookmark, can fill the form from the URL
const params = new URLSearchParams(location.search);
for (const input of form.querySelectorAll("input"))
  input.value = params.get(input.name) ?? input.value;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  const field = (name: string): string => fields.get(name) as string;
  void start(
    field("homeserver"),
    field("username"),
    field("password"),
    field("room"),
  );
});

async function start(
  homeserver: string,
  username: string,
  password: string,
  roomIdOrAlias: string,
): Promise<void> {
  try {
    status.textContent = "Logging in";
    const client = await createSession(homeserver, username, password);
    const room = await client.joinRoom(roomIdOrAlias);

    const scope = new ObservableScope();
    const session = createRtcSession(
      scope,
      client,
      room,
      {
        microphoneEnabled$: constant(true),
        cameraEnabled$: constant(true),
        audioInputDeviceId$: constant(undefined),
        videoInputDeviceId$: constant(undefined),
        videoProcessor$: constant(undefined),
      },
      {
        encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
        matrixRTCMode: MatrixRTCMode.Compatibility,
      },
    );
    showMembers(scope, session);
    session.join();
    status.textContent = "Joined";

    leaveButton.hidden = false;
    leaveButton.onclick = (): void => {
      session.leave();
      scope.end();
      members.replaceChildren();
      leaveButton.hidden = true;
      status.textContent = "Left";
    };
  } catch (e) {
    status.textContent = `Error: ${e}`;
    logger.error(e);
  }
}

function showMembers(scope: ObservableScope, session: RtcSession): void {
  const tiles = new Map<string, HTMLElement>();
  combineLatest([session.localMember$, session.remoteMembers$])
    .pipe(scope.bind())
    .subscribe(([local, remote]) => {
      const current = local === null ? remote : [local, ...remote];
      for (const [id, tile] of tiles)
        if (!current.some((m) => m.id === id)) {
          tile.remove();
          tiles.delete(id);
        }
      for (const member of current)
        if (!tiles.has(member.id)) {
          const tile = memberTile(scope, member);
          tiles.set(member.id, tile);
          members.append(tile);
        }
    });
}

function memberTile(scope: ObservableScope, member: RtcMember): HTMLElement {
  const tile = document.createElement("section");
  tile.dataset.testid = "member";
  tile.dataset.userId = member.userId;

  const name = tile.appendChild(document.createElement("h2"));
  member.displayName$.pipe(scope.bind()).subscribe((n) => {
    name.textContent = n;
  });

  const camera$ = member.media$.pipe(
    switchMap((media) => media?.camera$ ?? of(undefined)),
  );
  render(scope, camera$, tile.appendChild(document.createElement("video")));
  // Our own microphone would only echo
  if (!member.local) {
    const microphone$ = member.media$.pipe(
      switchMap((media) => media?.microphone$ ?? of(undefined)),
    );
    render(
      scope,
      microphone$,
      tile.appendChild(document.createElement("audio")),
    );
  }
  return tile;
}

function render(
  scope: ObservableScope,
  track$: Observable<MediaTrack | undefined>,
  element: HTMLMediaElement,
): void {
  let attached: MediaTrack | undefined;
  track$.pipe(scope.bind()).subscribe((track) => {
    attached?.detach(element);
    attached = track;
    track?.attach(element);
  });
  scope.onEnd(() => attached?.detach(element));
}
