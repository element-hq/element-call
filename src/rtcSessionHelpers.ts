/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type MatrixRTCSession,
  isLivekitTransportConfig,
  type LivekitTransportConfig,
  type LivekitTransport,
} from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";

import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import { Config } from "./config/Config";
import { ElementWidgetActions, widget } from "./widget";
import { MatrixRTCTransportMissingError } from "./utils/errors";
import { getUrlParams } from "./UrlParams";
import { getSFUConfigWithOpenID } from "./livekit/openIDSFU.ts";

const FOCI_WK_KEY = "org.matrix.msc4143.rtc_foci";

export function getLivekitAlias(rtcSession: MatrixRTCSession): string {
  // For now we assume everything is a room-scoped call
  return rtcSession.room.roomId;
}

async function makeTransportInternal(
  rtcSession: MatrixRTCSession,
): Promise<LivekitTransport> {
  logger.log("Searching for a preferred transport");
  const livekitAlias = getLivekitAlias(rtcSession);

  // TODO-MULTI-SFU: Either remove this dev tool or make it more official
  const urlFromStorage =
    localStorage.getItem("robin-matrixrtc-auth") ??
    localStorage.getItem("timo-focus-url");
  if (urlFromStorage !== null) {
    const transportFromStorage: LivekitTransport = {
      type: "livekit",
      livekit_service_url: urlFromStorage,
      livekit_alias: livekitAlias,
    };
    logger.log(
      "Using LiveKit transport from local storage: ",
      transportFromStorage,
    );
    return transportFromStorage;
  }

  // Prioritize the .well-known/matrix/client, if available, over the configured SFU
  const domain = rtcSession.room.client.getDomain();
  if (domain) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFoci = (await AutoDiscovery.getRawClientConfig(domain))?.[
      FOCI_WK_KEY
    ];
    if (Array.isArray(wellKnownFoci)) {
      const transport: LivekitTransportConfig | undefined = wellKnownFoci.find(
        (f) => f && isLivekitTransportConfig(f),
      );
      if (transport !== undefined) {
        logger.log("Using LiveKit transport from .well-known: ", transport);
        return { ...transport, livekit_alias: livekitAlias };
      }
    }
  }

  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf) {
    const transportFromConf: LivekitTransport = {
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    };
    logger.log("Using LiveKit transport from config: ", transportFromConf);
    return transportFromConf;
  }

  throw new MatrixRTCTransportMissingError(domain ?? "");
}

export async function makeTransport(
  rtcSession: MatrixRTCSession,
): Promise<LivekitTransport> {
  const transport = await makeTransportInternal(rtcSession);
  // this will call the jwt/sfu/get endpoint to pre create the livekit room.
  await getSFUConfigWithOpenID(
    rtcSession.room.client,
    transport.livekit_service_url,
    transport.livekit_alias,
  );
  return transport;
}

export interface EnterRTCSessionOptions {
  encryptMedia: boolean;
  /** EXPERIMENTAL: If true, will use the multi-sfu codepath where each member connects to its SFU instead of everyone connecting to an elected on. */
  useMultiSfu: boolean;
  preferStickyEvents: boolean;
}

/**
 * TODO! document this function properly
 * @param rtcSession
 * @param transport
 * @param options
 */
export async function enterRTCSession(
  rtcSession: MatrixRTCSession,
  transport: LivekitTransport,
  { encryptMedia, useMultiSfu, preferStickyEvents }: EnterRTCSessionOptions,
): Promise<void> {
  PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
  PosthogAnalytics.instance.eventCallStarted.track(rtcSession.room.roomId);

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  // groupCallOTelMembership?.onJoinCall();

  const { features, matrix_rtc_session: matrixRtcSessionConfig } = Config.get();
  const useDeviceSessionMemberEvents =
    features?.feature_use_device_session_member_events;
  const { sendNotificationType: notificationType, callIntent } = getUrlParams();
  // Multi-sfu does not need a preferred foci list. just the focus that is actually used.
  rtcSession.joinRoomSession(
    useMultiSfu ? [] : [transport],
    useMultiSfu ? transport : undefined,
    {
      notificationType,
      callIntent,
      manageMediaKeys: encryptMedia,
      ...(useDeviceSessionMemberEvents !== undefined && {
        useLegacyMemberEvents: !useDeviceSessionMemberEvents,
      }),
      delayedLeaveEventRestartMs:
        matrixRtcSessionConfig?.delayed_leave_event_restart_ms,
      delayedLeaveEventDelayMs:
        matrixRtcSessionConfig?.delayed_leave_event_delay_ms,
      delayedLeaveEventRestartLocalTimeoutMs:
        matrixRtcSessionConfig?.delayed_leave_event_restart_local_timeout_ms,
      networkErrorRetryMs: matrixRtcSessionConfig?.network_error_retry_ms,
      makeKeyDelay: matrixRtcSessionConfig?.wait_for_key_rotation_ms,
      membershipEventExpiryMs:
        matrixRtcSessionConfig?.membership_event_expiry_ms,
      useExperimentalToDeviceTransport: true,
      unstableSendStickyEvents: preferStickyEvents,
    },
  );
  if (widget) {
    try {
      await widget.api.transport.send(ElementWidgetActions.JoinCall, {});
    } catch (e) {
      logger.error("Failed to send join action", e);
    }
  }
}
