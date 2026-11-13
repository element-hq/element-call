/*
Copyright 2025-2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * The entrypoint of `pnpm build:widget-rtc-sdk`: a bundle for widget pages that
 * exposes `createMatrixRTCSdk`, to join a slot and exchange realtime data. It is
 * a thin widget wrapper around the `@element-hq/matrixrtc-sdk` package and uses
 * nothing of Element Call's app.
 */

import { logger as rootLogger } from "matrix-js-sdk/lib/logger";
import {
  createRoomWidgetClient,
  EventType,
  type MatrixClient,
} from "matrix-js-sdk/lib/matrix";
import { MatrixCapabilities, WidgetApi } from "matrix-widget-api";
import {
  EMPTY,
  filter,
  fromEvent,
  map,
  type Observable,
  of,
  switchMap,
  take,
} from "rxjs";
import {
  type Behavior,
  createRTCSlot,
  type DelayedLeaveTimings,
  E2eeType,
  type LocalRTCMember,
  MatrixRTCMode,
  ObservableScope,
  type RemoteRTCMember,
  type RTCParticipation,
  type RTCParticipationOptions,
} from "@element-hq/matrixrtc-sdk";

/** The data channel topic this bundle has always used, so that old and new builds talk. */
const TOPIC = "matrixRTC";

/** The widget actions of Element Web's that this bundle takes part in. */
const JOIN_ACTION = "io.element.join";
const HANGUP_ACTION = "im.vector.hangup";
const CLOSE_ACTION = "io.element.close";

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

/** The subset of Element Call's `config.json` this bundle reads. */
interface WidgetConfig {
  matrix_rtc_mode?: MatrixRTCMode;
  livekit?: { livekit_service_url: string };
  sync_disconnect_grace_period_ms?: number;
  matrix_rtc_session?: {
    network_error_retry_ms?: number;
    membership_event_expiry_ms?: number;
    key_rotation_participant_limit?: number;
    delayed_leave?: DelayedLeaveTimings;
    delegated_delayed_leave?: DelayedLeaveTimings;
  };
}

/**
 * The parameters the host fills into the widget URL, from the query or from a
 * query in the fragment, as Element Call reads them.
 */
function widgetParams(): URLSearchParams {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;
  const fragmentQuery = hash.indexOf("?");
  if (fragmentQuery !== -1)
    for (const [key, value] of new URLSearchParams(
      hash.substring(fragmentQuery),
    ))
      params.set(key, value);
  return params;
}

/** `config.json` beside the widget page, if there is one. */
async function loadConfig(): Promise<WidgetConfig> {
  try {
    const response = await fetch("config.json");
    if (response.ok) return (await response.json()) as WidgetConfig;
  } catch {}
  return {};
}

/**
 * Connects to the host over the widget API and builds the Matrix client that
 * routes every request through it, asking for what the SDK needs.
 */
function connectWidget(
  params: URLSearchParams,
  application: string,
): { api: WidgetApi; client: MatrixClient; roomId: string } {
  const required = (name: string): string => {
    const value = params.get(name);
    if (!value) throw new Error(`The widget url needs ${name}`);
    return value;
  };
  const widgetId = required("widgetId");
  const parentUrl = required("parentUrl");
  const roomId = required("roomId");
  const userId = required("userId");
  const deviceId = required("deviceId");
  const baseUrl = required("baseUrl");

  const api = new WidgetApi(widgetId, new URL(parentUrl).origin);
  api.requestCapability(MatrixCapabilities.AlwaysOnScreen);

  const sendRecvEvent = [
    EventType.CallEncryptionKeysPrefix,
    EventType.RTCDecline,
    EventType.RTCMembership,
  ];
  const sendRecvToDevice = [EventType.CallEncryptionKeysPrefix];
  const client = createRoomWidgetClient(
    api,
    {
      sendEvent: [
        ...sendRecvEvent,
        EventType.CallNotify, // Sent as a deprecated fallback
        EventType.RTCNotification,
        EventType.RoomMessage, // For sendRoomMessage
      ],
      receiveEvent: sendRecvEvent,
      sendState: [
        userId, // Legacy call membership events
        `_${userId}_${deviceId}_${application}`, // Session membership events
        `${userId}_${deviceId}_${application}`, // The above with no leading underscore, for room versions whose auth rules allow it
      ].map((stateKey) => ({
        eventType: EventType.GroupCallMemberPrefix,
        stateKey,
      })),
      receiveState: [
        { eventType: EventType.RoomCreate },
        { eventType: EventType.RoomName },
        { eventType: EventType.RoomMember },
        { eventType: EventType.RoomEncryption },
        { eventType: EventType.GroupCallMemberPrefix },
        { eventType: EventType.RTCSlot },
      ],
      sendToDevice: sendRecvToDevice,
      receiveToDevice: sendRecvToDevice,
      turnServers: false,
      rtcTransports: true,
      rtcLivekitGetToken: true,
      rtcLivekitDelegateDelayedLeave: true,
      sendDelayedEvents: true,
      updateDelayedEvents: true,
      sendSticky: true,
      receiveSticky: true,
    },
    roomId,
    { baseUrl, userId, deviceId, timelineSupport: true },
    false,
  );
  return { api, client, roomId };
}

export async function createMatrixRTCSdk(
  application = "m.call",
  id = "",
  sticky = false,
): Promise<MatrixRTCSdk> {
  const logger = rootLogger.getChild("[MatrixRTCSdk]");
  const params = widgetParams();
  const { api, client, roomId } = connectWidget(params, application);
  const config = await loadConfig();
  await client.startClient();
  const room = client.getRoom(roomId);
  if (room === null) throw new Error("No room: the url needs a joined roomId");

  const scope = new ObservableScope();
  const slot = createRTCSlot(scope, client, room, {
    encryptionSystem: { kind: E2eeType.PER_PARTICIPANT },
    matrixRTCMode: config.matrix_rtc_mode ?? MatrixRTCMode.Compatibility,
    application,
    id,
  });
  const session = config.matrix_rtc_session;
  const sendNotificationType = params.get("sendNotificationType");
  const participationOptions: RTCParticipationOptions = {
    // A data-only participation: nothing is published
    publish: [],
    sendNotificationType:
      sendNotificationType === "ring" || sendNotificationType === "notification"
        ? sendNotificationType
        : undefined,
    // Only what the config sets: the SDK spreads these over its defaults
    timings: Object.fromEntries(
      Object.entries({
        syncDisconnectGracePeriodMs: config.sync_disconnect_grace_period_ms,
        networkErrorRetryMs: session?.network_error_retry_ms,
        membershipEventExpiryMs: session?.membership_event_expiry_ms,
        keyRotationParticipantLimit: session?.key_rotation_participant_limit,
        delayedLeave: session?.delayed_leave,
        delegatedDelayedLeave: session?.delegated_delayed_leave,
      }).filter(([, value]) => value !== undefined),
    ),
    fallbackTransport: config.livekit && {
      type: "livekit",
      livekit_service_url: config.livekit.livekit_service_url,
    },
  };

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

  const leave = (): void => {
    const participation = slot.participation$.value;
    if (participation === null) return;
    participation.leave();
    api.transport
      .send(HANGUP_ACTION, {})
      .catch(failed("Failed to notify the host that we hung up"));
  };

  // The host's hang-up button
  fromEvent<CustomEvent>(api, `action:${HANGUP_ACTION}`)
    .pipe(scope.bind())
    .subscribe((ev) => {
      ev.preventDefault();
      api.transport.reply(ev.detail, {});
      leave();
    });

  return {
    join: (): void => {
      if (slot.participation$.value !== null) return;
      if (sticky)
        api
          .setAlwaysOnScreen(true)
          .catch(failed("Failed to make the widget sticky"));
      const participation = slot.join(participationOptions);
      api.transport
        .send(JOIN_ACTION, {})
        .catch(failed("Failed to notify the host that we joined"));
      // Once the hang-up has gone through, unstick and ask the host to close us
      participation.state$
        .pipe(
          filter((state) => state.kind === "left"),
          take(1),
          scope.bind(),
        )
        .subscribe(() => {
          api
            .setAlwaysOnScreen(false)
            .catch(failed("Failed to unstick the widget"))
            .then(async () => api.transport.send(CLOSE_ACTION, {}))
            .catch(failed("Failed to ask the host to close"))
            .finally(() => api.transport.stop());
        });
    },
    leave,
    stop: (): void => scope.end(),
    connected$: over(
      (p) => p.state$.pipe(map((state) => state.kind === "connected")),
      false,
    ),
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
