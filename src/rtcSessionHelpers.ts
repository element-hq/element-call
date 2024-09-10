/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { logger } from "matrix-js-sdk/src/logger";
import {
  LivekitFocus,
  LivekitFocusActive,
  isLivekitFocus,
  isLivekitFocusConfig,
} from "matrix-js-sdk/src/matrixrtc/LivekitFocus";

import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import { Config } from "./config/Config";
import { ElementWidgetActions, WidgetHelpers, widget } from "./widget";

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

  // Prioritize the client well known over the configured sfu.
  const wellKnownFoci =
    rtcSession.room.client.getClientWellKnown()?.[FOCI_WK_KEY];
  if (Array.isArray(wellKnownFoci)) {
    preferredFoci.push(
      ...wellKnownFoci
        .filter((f) => !!f)
        .filter(isLivekitFocusConfig)
        .map((wellKnownFocus) => {
          logger.log("Adding livekit focus from well known: ", wellKnownFocus);
          return { ...wellKnownFocus, livekit_alias: livekitAlias };
        }),
    );
  }

  const urlFromConf = Config.get().livekit?.livekit_service_url;
  if (urlFromConf) {
    const focusFormConf: LivekitFocus = {
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    };
    logger.log("Adding livekit focus from config: ", focusFormConf);
    preferredFoci.push(focusFormConf);
  }

  if (preferredFoci.length === 0)
    throw new Error(
      `No livekit_service_url is configured so we could not create a focus.
    Currently we skip computing a focus based on other users in the room.`,
    );
  return Promise.resolve(preferredFoci);

  // TODO: we want to do something like this:
  //
  // const focusOtherMembers = await focusFromOtherMembers(
  //   rtcSession,
  //   livekitAlias,
  // );
  // if (focusOtherMembers) preferredFoci.push(focusOtherMembers);
}

export async function enterRTCSession(
  rtcSession: MatrixRTCSession,
  encryptMedia: boolean,
): Promise<void> {
  PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
  PosthogAnalytics.instance.eventCallStarted.track(rtcSession.room.roomId);

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  // groupCallOTelMembership?.onJoinCall();

  // right now we assume everything is a room-scoped call
  const livekitAlias = rtcSession.room.roomId;
  const useDeviceSessionMemberEvents =
    Config.get().features?.feature_use_device_session_member_events;
  rtcSession.joinRoomSession(
    await makePreferredLivekitFoci(rtcSession, livekitAlias),
    makeActiveFocus(),
    {
      manageMediaKeys: encryptMedia,
      ...(useDeviceSessionMemberEvents !== undefined && {
        useLegacyMemberEvents: !useDeviceSessionMemberEvents,
      }),
    },
  );
}

const widgetPostHangupProcedure = async (
  widget: WidgetHelpers,
): Promise<void> => {
  // we need to wait until the callEnded event is tracked on posthog.
  // Otherwise the iFrame gets killed before the callEnded event got tracked.
  await new Promise((resolve) => window.setTimeout(resolve, 10)); // 10ms
  PosthogAnalytics.instance.logout();

  try {
    await widget.api.setAlwaysOnScreen(false);
  } catch (e) {
    logger.error("Failed to set call widget `alwaysOnScreen` to false", e);
  }

  // We send the hangup event after the memberships have been updated
  // calling leaveRTCSession.
  // We need to wait because this makes the client hosting this widget killing the IFrame.
  await widget.api.transport.send(ElementWidgetActions.HangupCall, {});
};

export async function leaveRTCSession(
  rtcSession: MatrixRTCSession,
): Promise<void> {
  await rtcSession.leaveRoomSession();
  if (widget) {
    await widgetPostHangupProcedure(widget);
  }
}
