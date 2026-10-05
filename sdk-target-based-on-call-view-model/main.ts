/*
Copyright 2025-2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * LEGACY, in production use
 *
 * This file is the entrypoint of the legacy SDK bundle,
 * `pnpm build:sdk-target-based-on-call-view-model`, for use in widgets. It
 * exposes `createMatrixRTCSdk`, which creates the `MatrixRTCSdk` interface
 * (see below) to join an RTC session and exchange realtime data.
 *
 * It is a thin layer over the `@element-hq/matrixrtc-sdk` package and Element
 * Call's call view model, which take care of all the tricky bits:
 *  - sending delayed events
 *  - finding the right sfu
 *  - handling the media stream
 *  - sending join/leave state or sticky events
 *  - setting up encryption and sharing keys
 *
 * The interface is kept as it was for its existing consumers. New consumers
 * use the `@element-hq/matrixrtc-sdk` package directly; this bundle goes away
 * once the existing ones have moved.
 */

import {
  combineLatest,
  filter,
  map,
  type Observable,
  of,
  switchMap,
} from "rxjs";
import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  type Behavior,
  createMatrixRTCClient,
  E2eeType,
  ObservableScope,
  type RTCMember,
  type RTCMembership,
} from "@element-hq/matrixrtc-sdk";

import {
  callViewModelOptionsFromParams,
  createCallViewModel$,
  initialPublishRequests,
} from "../src/state/CallViewModel/CallViewModel";
import { getUrlParams } from "../src/UrlParams";
import { MuteStates } from "../src/state/MuteStates";
import { MediaDevices } from "../src/state/MediaDevices";
import { TEXT_LK_TOPIC, tryMakeSticky } from "./helper";
import { initializeWidget } from "../src/widget";
import { createWidgetHostBridge } from "../src/HostBridge";
import { observeElementSize$ } from "../src/utils/elementSize";
import {
  captureSettings,
  matrixRTCClientOptions,
} from "../src/room/InCallView";

/**
 * A member as this bundle has always presented it. The media transport is
 * the SDK's business now, so the transport objects are gone: `connection` and
 * `participant` are always null and only kept so that existing code keeps
 * destructuring. `membership` is what consumers read.
 */
interface MatrixRTCSdkMember {
  /** @deprecated Always null: the SDK owns the transport connection. */
  connection: null;
  membership: RTCMembership;
  /** @deprecated Always null: the SDK owns the transport participant. */
  participant: null;
}

interface MatrixRTCSdk {
  /**
   * observe connected$ to track the state.
   * @returns
   */
  join: () => void;
  /** @throws on leave errors */
  leave: () => void;
  /**
   * Ends the rtc sdk. This will unsubscribe any event listeners. And end the associated scope.
   * No updates can be received from the rtc sdk. The sdk cannot be restarted after.
   * A new sdk needs to be created via createMatrixRTCSdk.
   */
  stop: () => void;
  data$: Observable<{ rtcBackendIdentity: string; data: string }>;
  /**
   * flattened list of remote members
   */
  remoteMembers$: Behavior<MatrixRTCSdkMember[]>;
  /**
   * flattened local member
   */
  localMember$: Behavior<MatrixRTCSdkMember | null>;
  /** Use the LocalMemberConnectionState returned from `join` for a more detailed connection state  */
  connected$: Behavior<boolean>;
  sendData?: (data: unknown) => Promise<void>;
  sendRoomMessage?: (message: string) => Promise<void>;
}

export async function createMatrixRTCSdk(
  application: string = "m.call",
  id: string = "",
  sticky: boolean = false,
): Promise<MatrixRTCSdk> {
  const logger = rootLogger.getChild("[MatrixRTCSdk]");
  const scope = new ObservableScope();

  // widget client
  const widget = initializeWidget(application, true);
  if (!widget) throw Error("No widget. This webapp can only start as a widget");
  const client = await widget.client;
  const hostBridge = createWidgetHostBridge(widget);
  logger.info("client created");

  // url params
  const urlParams = getUrlParams();
  const { roomId, controlledAudioDevices, callIntent } = urlParams;
  if (roomId === null) throw Error("could not get roomId from url params");
  const room = client.getRoom(roomId);
  if (room === null) throw Error("could not get room from client");

  // media devices
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

  // rtc client: the session, the transport and the media, as in the app
  const encryptionSystem = { kind: E2eeType.PER_PARTICIPANT } as const;
  const capture = captureSettings();
  const rtcClient = createMatrixRTCClient(scope, client, room, {
    ...matrixRTCClientOptions(urlParams, encryptionSystem),
    publish: initialPublishRequests(muteStates, mediaDevices, capture),
    application,
    slot: id,
  });

  // call view model: the host bridge's hang-up handling and the leave flow
  const callViewModel = createCallViewModel$(
    scope,
    rtcClient,
    room,
    mediaDevices,
    muteStates,
    {
      ...callViewModelOptionsFromParams(urlParams),
      encryptionSystem,
      capture,
      hostBridge,
      // The SDK owns its page, so the body is the space it has
      windowSize$: scope.behavior(observeElementSize$(document.body)),
    },
    of({}),
    of({}),
  );
  logger.info("CallViewModelCreated");

  // Data arrives from attested members only; the SDK has matched the sender
  const data$ = rtcClient.data$.pipe(
    filter(({ topic }) => topic === TEXT_LK_TOPIC),
    map(({ member, text }) => {
      logger.info(`Received text from ${member.id}: ${text}`);
      return { rtcBackendIdentity: member.id, data: text };
    }),
  );

  const sendData = async (data: unknown): Promise<void> => {
    const dataString = JSON.stringify(data);
    logger.info("try sending: ", dataString);
    try {
      await rtcClient.sendData(TEXT_LK_TOPIC, dataString);
      logger.info("sent text");
    } catch (e) {
      logger.error("failed sending: ", dataString, e);
    }
  };

  const sendRoomMessage = async (message: string): Promise<void> => {
    const messageString = JSON.stringify(message);
    logger.info("try sending to room: ", messageString);
    try {
      await client.sendTextMessage(room.roomId, message);
    } catch (e) {
      logger.error("failed sending to room: ", messageString, e);
    }
  };

  // after hangup gets called
  const leaveSubs = callViewModel.leave$.subscribe(() => {
    const scheduleWidgetCloseOnLeave = async (): Promise<void> => {
      logger.info("waiting for RTC leave");
      await new Promise<void>((resolve) => {
        rtcClient.status$
          .pipe(filter((status) => status === "disconnected"))
          .subscribe(() => resolve());
      });
      logger.info("send Unstick");
      await hostBridge
        .setAlwaysOnScreen(false)
        .catch((e: unknown) =>
          logger.error("Failed to set `alwaysOnScreen` to false", e),
        );
      logger.info("send Close");
      await hostBridge
        .close?.()
        .catch((e: unknown) =>
          logger.error("Failed to ask the host to close", e),
        );
    };

    // schedule close first and then leave (scope.end)
    void scheduleWidgetCloseOnLeave();
  });

  logger.info("createMatrixRTCSdk done");

  const flatten = (member: RTCMember): Observable<MatrixRTCSdkMember> =>
    member.membership$.pipe(
      map((membership) => ({
        connection: null,
        membership,
        participant: null,
      })),
    );

  return {
    join: (): void => {
      // first lets try making the widget sticky
      if (sticky) tryMakeSticky(widget);
      callViewModel.join();
    },
    leave: (): void => {
      callViewModel.leave();
    },
    stop: (): void => {
      leaveSubs.unsubscribe();
      scope.end();
    },
    data$,
    localMember$: scope.behavior(
      rtcClient.localMember$.pipe(
        switchMap((member) => (member === null ? of(null) : flatten(member))),
      ),
    ),
    connected$: callViewModel.connected$,
    remoteMembers$: scope.behavior(
      rtcClient.remoteMembers$.pipe(
        switchMap((members) =>
          members.length === 0
            ? of([])
            : combineLatest(members.map((member) => flatten(member))),
        ),
      ),
      [],
    ),
    sendData,
    sendRoomMessage,
  };
}
