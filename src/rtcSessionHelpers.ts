/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  isLivekitFocus,
  isLivekitFocusConfig,
  type LivekitFocus,
  type LivekitFocusActive,
  type MatrixRTCSession,
} from "matrix-js-sdk/lib/matrixrtc";
import { logger } from "matrix-js-sdk/lib/logger";
import { AutoDiscovery } from "matrix-js-sdk/lib/autodiscovery";

import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import { Config } from "./config/Config";
import { ElementWidgetActions, widget, type WidgetHelpers } from "./widget";
import { MatrixRTCFocusMissingError } from "./utils/errors";
import { getUrlParams } from "./UrlParams";
import { getSFUConfigWithOpenID } from "./livekit/openIDSFU.ts";

const FOCI_WK_KEY = "org.matrix.msc4143.rtc_foci";

export function makeActiveFocus(): LivekitFocusActive {
  return {
    type: "livekit",
    focus_selection: "oldest_membership",
  };
}

async function makePreferredLivekitFoci(
  rtcSession: MatrixRTCSession,
  livekitAlias: string,
): Promise<LivekitFocus[]> {
  logger.log("Start building foci_preferred list: ", rtcSession.room.roomId);

  const preferredFoci: LivekitFocus[] = [];

  // Make the Focus from the running rtc session the highest priority one
  // This minimizes how often we need to switch foci during a call.
  const focusInUse = rtcSession.getFocusInUse();
  if (focusInUse && isLivekitFocus(focusInUse)) {
    logger.log("Adding livekit focus from oldest member: ", focusInUse);
    preferredFoci.push(focusInUse);
  }

  // Prioritize the .well-known/matrix/client, if available, over the configured SFU
  const domain = rtcSession.room.client.getDomain();
  if (domain) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFoci = await getFocusListFromWellKnown(domain, livekitAlias);
    logger.log("Adding livekit focus from well known: ", wellKnownFoci);
    preferredFoci.push(...wellKnownFoci);
  }

  const focusFormConf = getFocusListFromConfig(livekitAlias);
  if (focusFormConf) {
    logger.log("Adding livekit focus from config: ", focusFormConf);
    preferredFoci.push(focusFormConf);
  }

  if (preferredFoci.length === 0)
    throw new MatrixRTCFocusMissingError(domain ?? "");
  return Promise.resolve(preferredFoci);

  // TODO: we want to do something like this:
  //
  // const focusOtherMembers = await focusFromOtherMembers(
  //   rtcSession,
  //   livekitAlias,
  // );
  // if (focusOtherMembers) preferredFoci.push(focusOtherMembers);
}

async function getFocusListFromWellKnown(
  domain: string,
  alias: string,
): Promise<LivekitFocus[]> {
  if (domain) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFoci = (await AutoDiscovery.getRawClientConfig(domain))?.[
      FOCI_WK_KEY
    ];
    if (Array.isArray(wellKnownFoci)) {
      return wellKnownFoci
        .filter((f) => !!f)
        .filter(isLivekitFocusConfig)
        .map((wellKnownFocus) => {
          return { ...wellKnownFocus, livekit_alias: alias };
        });
    }
  }
  return [];
}

function getFocusListFromConfig(livekitAlias: string): LivekitFocus | null {
  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf) {
    return {
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    };
  }
  return null;
}

export async function getMyPreferredLivekitFoci(
  domain: string | null,
  livekitAlias: string,
): Promise<LivekitFocus> {
  if (domain) {
    // we use AutoDiscovery instead of relying on the MatrixClient having already
    // been fully configured and started
    const wellKnownFociList = await getFocusListFromWellKnown(
      domain,
      livekitAlias,
    );
    if (wellKnownFociList.length > 0) {
      return wellKnownFociList[0];
    }
  }

  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf) {
    return {
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    };
  }
  throw new MatrixRTCFocusMissingError(domain ?? "");
}

// Stop-gap solution for pre-warming the SFU.
// This is needed to ensure that the livekit room is created before we try to join the rtc session.
// This is because the livekit room creation is done by the auth service and this can be restricted to
// only specific users, so we need to ensure that the room is created before we try to join it.
async function preWarmSFU(
  rtcSession: MatrixRTCSession,
  livekitAlias: string,
): Promise<void> {
  const client = rtcSession.room.client;
  // We need to make sure that the livekit room is created before sending the membership event
  // because other joiners might not be able to join the call if the room does not exist yet.
  const fociToWarmup = await getMyPreferredLivekitFoci(
    client.getDomain(),
    livekitAlias,
  );

  // Request a token in advance to warm up the livekit room.
  // Let it throw if it fails, errors will be handled by the ErrorBoundary, if it fails now
  // it will fail later when we try to join the room.
  await getSFUConfigWithOpenID(client, fociToWarmup);
  // For now we don't do anything with the token returned by `getSFUConfigWithOpenID`, it is just to ensure that we
  // call the `sfu/get` endpoint so that the auth service create the room in advance if it can.
  // Note: This is not actually checking that the room was created! If the roon creation is
  // not done by the auth service, the call will fail later when we try to join the room; that case
  // is a miss-configuration of the auth service, you should be able to create room in your selected SFU.
  // A solution could be to call the internal `/validate` endpoint to check that the room exists, but this needs
  // to access livekit internal APIs, so we don't do it for now.
}

export async function enterRTCSession(
  rtcSession: MatrixRTCSession,
  encryptMedia: boolean,
  useNewMembershipManager = true,
  useExperimentalToDeviceTransport = false,
): Promise<void> {
  PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
  PosthogAnalytics.instance.eventCallStarted.track(rtcSession.room.roomId);

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  // groupCallOTelMembership?.onJoinCall();

  // right now we assume everything is a room-scoped call
  const livekitAlias = rtcSession.room.roomId;
  const { features, matrix_rtc_session: matrixRtcSessionConfig } = Config.get();
  const useDeviceSessionMemberEvents =
    features?.feature_use_device_session_member_events;

  // Pre-warm the SFU to ensure that the room is created before anyone tries to join it.
  await preWarmSFU(rtcSession, livekitAlias);

  rtcSession.joinRoomSession(
    await makePreferredLivekitFoci(rtcSession, livekitAlias),
    makeActiveFocus(),
    {
      notificationType: getUrlParams().sendNotificationType,
      useNewMembershipManager,
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
      useExperimentalToDeviceTransport,
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

const widgetPostHangupProcedure = async (
  widget: WidgetHelpers,
  cause: "user" | "error",
  promiseBeforeHangup?: Promise<unknown>,
): Promise<void> => {
  try {
    await widget.api.setAlwaysOnScreen(false);
  } catch (e) {
    logger.error("Failed to set call widget `alwaysOnScreen` to false", e);
  }

  // Wait for any last bits before hanging up.
  await promiseBeforeHangup;
  // We send the hangup event after the memberships have been updated
  // calling leaveRTCSession.
  // We need to wait because this makes the client hosting this widget killing the IFrame.
  try {
    await widget.api.transport.send(ElementWidgetActions.HangupCall, {});
  } catch (e) {
    logger.error("Failed to send hangup action", e);
  }
  // On a normal user hangup we can shut down and close the widget. But if an
  // error occurs we should keep the widget open until the user reads it.
  if (cause === "user" && !getUrlParams().returnToLobby) {
    try {
      await widget.api.transport.send(ElementWidgetActions.Close, {});
    } catch (e) {
      logger.error("Failed to send close action", e);
    }
    widget.api.transport.stop();
  }
};

export async function leaveRTCSession(
  rtcSession: MatrixRTCSession,
  cause: "user" | "error",
  promiseBeforeHangup?: Promise<unknown>,
): Promise<void> {
  await rtcSession.leaveRoomSession();
  if (widget) {
    await widgetPostHangupProcedure(widget, cause, promiseBeforeHangup);
  } else {
    await promiseBeforeHangup;
  }
}
