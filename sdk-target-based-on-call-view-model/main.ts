/*
Copyright 2025-2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * LEGACY, in production use
 *
 * The entrypoint of `pnpm build:sdk-target-based-on-call-view-model`, a
 * bundle for widgets that exposes `createMatrixRTCSdk`: join a slot and
 * exchange realtime data, with the `@element-hq/matrixrtc-sdk` package and
 * Element Call's call view model doing the work underneath. New consumers use
 * the package directly; this bundle goes away once the existing ones have.
 */

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  distinct,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  mergeMap,
  type Observable,
  of,
  switchMap,
  take,
  takeUntil,
} from "rxjs";
import {
  type Behavior,
  createRTCSlot,
  type DataTrack,
  E2eeType,
  type LocalDataTrack,
  type LocalRTCMember,
  ObservableScope,
  type RemoteRTCMember,
  type RTCParticipation,
} from "@element-hq/matrixrtc-sdk";

import {
  callViewModelOptionsFromParams,
  type CallViewModel,
  createCallViewModel$,
  initialPublishRequests,
} from "../src/state/CallViewModel/CallViewModel";
import {
  captureSettings,
  rtcParticipationOptions,
  rtcSlotOptions,
} from "../src/room/InCallView";
import { createWidgetHostBridge } from "../src/HostBridge";
import { MediaDevices } from "../src/state/MediaDevices";
import { MuteStates } from "../src/state/MuteStates";
import { getUrlParams } from "../src/UrlParams";
import { observeElementSize$ } from "../src/utils/elementSize";
import { initializeWidget } from "../src/widget";

/** The name of our data track: the topic this bundle has always used, so that old and new builds talk. */
const TOPIC = "matrixRTC";

export interface MatrixRTCSdk {
  /** Joins the slot; `connected$` tracks the progress. A second call does nothing. */
  join: () => void;
  leave: () => void;
  /** Ends everything. The sdk cannot be restarted; create a new one. */
  stop: () => void;
  connected$: Behavior<boolean>;
  /** Our own member, null until our membership has been seen in the room. */
  localMember$: Behavior<LocalRTCMember | null>;
  /** The other members of the slot, with the media the participation carries for them. */
  remoteMembers$: Behavior<RemoteRTCMember[]>;
  /** What other members sent with `sendData`, on their data track. */
  data$: Observable<{ rtcBackendIdentity: string; data: string }>;
  /** Sends on our data track, published with the first message. Rejects while not joined. */
  sendData: (data: unknown) => Promise<void>;
  sendRoomMessage: (message: string) => Promise<void>;
}

export async function createMatrixRTCSdk(
  application = "m.call",
  id = "",
  sticky = false,
): Promise<MatrixRTCSdk> {
  const logger = rootLogger.getChild("[MatrixRTCSdk]");
  const scope = new ObservableScope();
  const widget = initializeWidget(application, true);
  if (!widget) throw new Error("No widget: this bundle only runs as a widget");
  const client = await widget.client;
  const hostBridge = createWidgetHostBridge(widget);
  const urlParams = getUrlParams();
  const { roomId, controlledAudioDevices, callIntent } = urlParams;
  const room = roomId === null ? null : client.getRoom(roomId);
  if (room === null) throw new Error("No room: the url needs a joined roomId");

  const mediaDevices = new MediaDevices(scope, {
    controlledAudioDevices,
    callIntent,
  });
  const muteStates = new MuteStates(
    scope,
    mediaDevices,
    { audioEnabled: false, videoEnabled: false },
    hostBridge,
  );
  const encryptionSystem = { kind: E2eeType.PER_PARTICIPANT } as const;
  const capture = captureSettings();
  const slot = createRTCSlot(scope, client, room, {
    ...rtcSlotOptions(encryptionSystem),
    application,
    id,
  });
  let vm: CallViewModel | undefined;
  let dataTrack: Promise<LocalDataTrack> | undefined;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const failed =
    (what: string) =>
    (e: unknown): void =>
      logger.error(what, e);

  const over = <T>(
    pick: (participation: RTCParticipation) => Observable<T>,
    fallback: T,
  ): Behavior<T> =>
    scope.behavior(
      slot.participation$.pipe(
        switchMap((p) => (p === null ? of(fallback) : pick(p))),
      ),
    );

  const remoteMembers$ = over((p) => p.remoteMembers$, []);

  return {
    join: (): void => {
      if (slot.participation$.value !== null) return;
      if (sticky)
        widget.api
          .setAlwaysOnScreen(true)
          .catch(failed("Failed to make the widget sticky"));
      dataTrack = undefined;
      const participation = slot.join({
        ...rtcParticipationOptions(urlParams),
        publish: initialPublishRequests(muteStates, mediaDevices, capture),
      });
      vm = createCallViewModel$(
        scope,
        participation,
        room,
        mediaDevices,
        muteStates,
        {
          ...callViewModelOptionsFromParams(urlParams),
          encryptionSystem,
          capture,
          hostBridge,
          // The bundle owns its page, so the body is the space it has
          windowSize$: scope.behavior(observeElementSize$(document.body)),
        },
        of({}),
        of({}),
      );
      // Once the hang-up has gone through, unstick and ask the host to close us
      vm.leave$
        .pipe(
          switchMap(() =>
            participation.state$.pipe(
              filter((state) => state.kind === "left"),
              take(1),
            ),
          ),
          scope.bind(),
        )
        .subscribe(() => {
          hostBridge
            .setAlwaysOnScreen(false)
            .catch(failed("Failed to unstick the widget"))
            .then(() => hostBridge.close?.())
            .catch(failed("Failed to ask the host to close"));
        });
    },
    leave: (): void => vm?.leave(),
    stop: (): void => scope.end(),
    connected$: over(
      (p) => p.state$.pipe(map((state) => state.kind === "connected")),
      false,
    ),
    localMember$: over((p) => p.localMember$, null),
    remoteMembers$,
    data$: remoteMembers$.pipe(
      // Each member once, for as long as it stays: a data track is only
      // subscribed while observed, so it is not dropped on every list change
      mergeMap((members) => members),
      distinct(),
      mergeMap((member) =>
        member.tracks$.pipe(
          map((tracks) =>
            tracks?.find(
              (t): t is DataTrack => t.kind === "data" && t.name === TOPIC,
            ),
          ),
          distinctUntilChanged(),
          switchMap((track) => track?.data$ ?? EMPTY),
          map((payload) => ({
            rtcBackendIdentity: member.rtcBackendIdentity,
            data: decoder.decode(payload),
          })),
          takeUntil(
            remoteMembers$.pipe(filter((members) => !members.includes(member))),
          ),
        ),
      ),
    ),
    sendData: async (data): Promise<void> => {
      const participation = slot.participation$.value;
      if (participation === null) throw new Error("Not joined");
      dataTrack ??= participation.publish({ source: "data", name: TOPIC });
      const track = await dataTrack.catch((e: unknown) => {
        dataTrack = undefined;
        throw e;
      });
      await track.send(encoder.encode(JSON.stringify(data)));
    },
    sendRoomMessage: async (message): Promise<void> => {
      await client.sendTextMessage(room.roomId, message);
    },
  };
}
