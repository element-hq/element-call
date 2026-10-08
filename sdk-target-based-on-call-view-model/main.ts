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
import { EMPTY, filter, map, type Observable, of, switchMap, take } from "rxjs";
import {
  type Behavior,
  createRTCSlot,
  E2eeType,
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

/** The data channel topic this bundle has always used, so that old and new builds talk. */
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
  /** What other members sent with `sendData`. */
  data$: Observable<{ rtcBackendIdentity: string; data: string }>;
  /** Sends to every member on our transport. Rejects while not joined. */
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

  return {
    join: (): void => {
      if (slot.participation$.value !== null) return;
      if (sticky)
        widget.api
          .setAlwaysOnScreen(true)
          .catch(failed("Failed to make the widget sticky"));
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
            participation.status$.pipe(
              filter((status) => status === "left"),
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
    connected$: over((p) => p.connected$, false),
    localMember$: over((p) => p.localMember$, null),
    remoteMembers$: over((p) => p.remoteMembers$, []),
    // Attested members only: the SDK has matched the sender
    data$: slot.participation$.pipe(
      switchMap((p) => p?.data$ ?? EMPTY),
      filter(({ topic }) => topic === TOPIC),
      map(({ member, text }) => ({
        rtcBackendIdentity: member.rtcBackendIdentity,
        data: text,
      })),
    ),
    sendData: async (data): Promise<void> => {
      const participation = slot.participation$.value;
      if (participation === null) throw new Error("Not joined");
      await participation.sendData(TOPIC, JSON.stringify(data));
    },
    sendRoomMessage: async (message): Promise<void> => {
      await client.sendTextMessage(room.roomId, message);
    },
  };
}
