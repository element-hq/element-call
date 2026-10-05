/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The smallest consumer of the SDK: log in, join a room, show every member's
 * camera and play every remote member's microphone, mute, leave. What a host
 * writes, and nothing a host would not.
 */

import { logger } from "matrix-js-sdk/lib/logger";
import { combineLatest, type Observable, of, switchMap } from "rxjs";
import {
  type AudioMediaTrack,
  createMatrixRTCClient,
  E2eeType,
  MatrixRTCMode,
  ObservableScope,
  type RTCMember,
  type MatrixRTCClient,
  trackBySource$,
  type VideoMediaTrack,
} from "@element-hq/matrixrtc-sdk";

import { createSession, joinRoom, type Login } from "./session";

const form = document.querySelector("form")!;
const status = document.getElementById("status")!;
const members = document.getElementById("members")!;
const dataForm = document.getElementById("data") as HTMLFormElement;
const messages = document.getElementById("messages")!;
const buttons = {
  microphone: document.getElementById("microphone") as HTMLButtonElement,
  camera: document.getElementById("camera") as HTMLButtonElement,
  screenShare: document.getElementById("screenShare") as HTMLButtonElement,
  leave: document.getElementById("leave") as HTMLButtonElement,
};

// So that a test, or a bookmark, can fill the form from the URL
const params = new URLSearchParams(location.search);
for (const input of form.querySelectorAll("input"))
  input.value = params.get(input.name) ?? input.value;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  const field = (name: string): string => fields.get(name) as string;
  const login: Login = field("accessToken")
    ? {
        accessToken: field("accessToken"),
        userId: field("userId"),
        deviceId: field("deviceId"),
      }
    : { username: field("username"), password: field("password") };
  void start(field("homeserver"), login, field("room"));
});

async function start(
  homeserver: string,
  login: Login,
  roomIdOrAlias: string,
): Promise<void> {
  try {
    status.textContent = "Logging in";
    const client = await createSession(homeserver, login);
    const room = await joinRoom(client, roomIdOrAlias);

    const scope = new ObservableScope();
    const rtcClient = createMatrixRTCClient(scope, client, room, {
      encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
      matrixRTCMode: MatrixRTCMode.Compatibility,
      publish: [{ source: "microphone" }, { source: "camera" }],
    });
    rtcClient.status$.pipe(scope.bind()).subscribe((s) => {
      status.textContent = s;
    });
    rtcClient.fatalError$.pipe(scope.bind()).subscribe((error) => {
      if (error !== null) status.textContent = `Error: ${error.message}`;
    });
    showMembers(scope, rtcClient);
    showMessages(scope, rtcClient);
    rtcClient.join();

    toggle(buttons.microphone, async (enabled) =>
      setPublished(rtcClient, "microphone", enabled),
    );
    toggle(buttons.camera, async (enabled) =>
      setPublished(rtcClient, "camera", enabled),
    );
    toggle(buttons.screenShare, async (enabled) =>
      setPublished(rtcClient, "screenShare", enabled),
    );
    buttons.leave.hidden = false;
    buttons.leave.onclick = (): void => {
      rtcClient.leave();
      scope.end();
      members.replaceChildren();
      messages.replaceChildren();
      dataForm.hidden = true;
      for (const button of Object.values(buttons)) button.hidden = true;
      status.textContent = "Left";
    };
  } catch (e) {
    status.textContent = `Error: ${e}`;
    logger.error(e);
  }
}

/**
 * Turns one of our sources on or off: a microphone or camera is muted and
 * unmuted while it exists and published when it does not; a screen share is
 * published and unpublished.
 */
async function setPublished(
  rtcClient: MatrixRTCClient,
  source: "microphone" | "camera" | "screenShare",
  enabled: boolean,
): Promise<boolean> {
  const member = rtcClient.localMember$.value;
  if (member === null) return !enabled;
  const track = member.media$.value?.tracks$.value.find(
    (t) => t.source === source,
  );
  if (track && source === "screenShare") {
    if (!enabled) await member.unpublish(track.id);
    return enabled;
  }
  if (track) return track.setEnabled(enabled);
  if (!enabled) return false;
  await member.publish({ source });
  return true;
}

/** A pressed button means the source is on; the SDK says what it could do. */
function toggle(
  button: HTMLButtonElement,
  set: (enabled: boolean) => Promise<boolean>,
): void {
  button.hidden = false;
  button.onclick = (): void => {
    void set(button.ariaPressed !== "true").then((enabled) => {
      button.ariaPressed = String(enabled);
    });
  };
}

/** Sends what the form holds on the "chat" topic, and lists what arrives. */
function showMessages(
  scope: ObservableScope,
  rtcClient: MatrixRTCClient,
): void {
  dataForm.hidden = false;
  dataForm.onsubmit = (event): void => {
    event.preventDefault();
    const text = new FormData(dataForm).get("text") as string;
    rtcClient.sendData("chat", text).then(
      () => dataForm.reset(),
      (e: unknown) => {
        status.textContent = `Error: ${e}`;
      },
    );
  };
  rtcClient.data$.pipe(scope.bind()).subscribe(({ member, topic, text }) => {
    const line = messages.appendChild(document.createElement("li"));
    line.dataset.testid = "message";
    line.dataset.topic = topic;
    line.dataset.userId = member.userId;
    line.textContent = `${member.displayName$.value}: ${text}`;
  });
}

function showMembers(scope: ObservableScope, rtcClient: MatrixRTCClient): void {
  const tiles = new Map<string, HTMLElement>();
  combineLatest([rtcClient.localMember$, rtcClient.remoteMembers$])
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

function memberTile(scope: ObservableScope, member: RTCMember): HTMLElement {
  const tile = document.createElement("section");
  tile.dataset.testid = "member";
  tile.dataset.userId = member.userId;
  tile.dataset.local = String(member.local);

  const name = tile.appendChild(document.createElement("h2"));
  member.displayName$.pipe(scope.bind()).subscribe((n) => {
    name.textContent = n;
  });

  const tracks$ = scope.behavior(
    member.media$.pipe(switchMap((media) => media?.tracks$ ?? of([]))),
  );
  render(
    scope,
    trackBySource$(scope, tracks$, "camera"),
    tile.appendChild(document.createElement("video")),
  );
  // Our own microphone would only echo
  if (!member.local)
    render(
      scope,
      trackBySource$(scope, tracks$, "microphone"),
      tile.appendChild(document.createElement("audio")),
    );
  return tile;
}

/**
 * Plays a track on an element and labels the element with the track's state,
 * so that the page shows what the member is sending and how well it arrives.
 */
function render(
  scope: ObservableScope,
  track$: Observable<AudioMediaTrack | VideoMediaTrack | undefined>,
  element: HTMLMediaElement,
): void {
  let attached: AudioMediaTrack | VideoMediaTrack | undefined;
  track$.pipe(scope.bind()).subscribe((track) => {
    attached?.detach(element);
    attached = track;
    track?.attach(element);
  });
  scope.onEnd(() => attached?.detach(element));

  const label = (
    key: string,
    value$: Observable<string | number | boolean | undefined>,
  ): void => {
    value$.pipe(scope.bind()).subscribe((value) => {
      if (value === undefined) delete element.dataset[key];
      else element.dataset[key] = String(value);
    });
  };
  const of$ = <T>(
    pick: (track: AudioMediaTrack | VideoMediaTrack) => Observable<T>,
  ): Observable<T | undefined> =>
    track$.pipe(switchMap((track) => (track ? pick(track) : of(undefined))));
  label(
    "muted",
    of$((t) => t.muted$),
  );
  label(
    "encrypted",
    of$((t) => t.encrypted$),
  );
  label(
    "active",
    of$((t) => (t.kind === "audio" ? t.isActive$ : of(undefined))),
  );
  const stats$ = of$((t) => t.stats$);
  label("frameWidth", stats$.pipe(switchMap((s) => of(frames(s)?.frameWidth))));
  label("frames", stats$.pipe(switchMap((s) => of(frames(s)?.count))));
}

/** The frame counters an RTP stream reports, from either end of it. */
function frames(
  stats: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined,
): { frameWidth: number | undefined; count: number | undefined } | undefined {
  if (stats === undefined) return undefined;
  return {
    frameWidth: stats.frameWidth,
    count:
      stats.type === "inbound-rtp"
        ? (stats as RTCInboundRtpStreamStats).framesDecoded
        : (stats as RTCOutboundRtpStreamStats).framesEncoded,
  };
}
