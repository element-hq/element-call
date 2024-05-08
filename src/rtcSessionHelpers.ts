/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { AutoDiscovery, RoomMember } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/src/logger";

import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import {
  LivekitFocusActive,
  LivekitFocus,
  LivekitFocusConfig,
  isLivekitFocus,
} from "./livekit/LivekitFocus";
import { Config } from "./config/Config";
import { ElementWidgetActions, WidgetHelpers, widget } from "./widget";

const LIVEKIT_FOCUS_WK_KEY = "livekit_focus";

export function makeActiveFocus(): LivekitFocusActive {
  return {
    type: "livekit",
    selection: "oldest_membership",
  };
}

async function makePreferredFoci(
  rtcSession: MatrixRTCSession,
  livekitAlias: string,
): Promise<LivekitFocus[]> {
  logger.log("Start building foci_preferred list: ", rtcSession.room.roomId);

  const preferredFoci: LivekitFocus[] = [];

  // Make the foci from the running rtc session the highest priority one
  // This minimizes how often we need to switch foci during a call.
  const focusFromMatrixRTC = rtcSession
    .getOldestMembership()
    ?.getPreferredFoci()[0];
  if (focusFromMatrixRTC && isLivekitFocus(focusFromMatrixRTC)) {
    logger.log("Adding livekit focus from oldest member: ", focusFromMatrixRTC);
    preferredFoci.push(focusFromMatrixRTC);
  }

  // Prioritize the client well known over the configured sfu.
  const wellKnownFocus =
    rtcSession.room.client.getClientWellKnown()?.[LIVEKIT_FOCUS_WK_KEY];
  if (wellKnownFocus) {
    logger.log("Adding livekit focus from well known: ", wellKnownFocus);
    preferredFoci.push(wellKnownFocus);
  }

  const urlFromConf = Config.get().livekit!.livekit_service_url;
  if (urlFromConf) {
    logger.log("Adding livekit focus from config: ", urlFromConf);
    preferredFoci.push({
      type: "livekit",
      livekit_service_url: urlFromConf,
      livekit_alias: livekitAlias,
    });
  }

  if (preferredFoci.length === 0)
    throw new Error(
      `No livekit_service_url is configured so we could not create a focus
    currently we skip computing a focus based on other users in the room.`,
    );

  // Currently we skip computing a focus based on other users in the room.
  const focusOtherMembers = await focusFromOtherMembers(
    rtcSession,
    livekitAlias,
  );
  if (focusOtherMembers) preferredFoci.push(focusOtherMembers);

  return preferredFoci;
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

  rtcSession.joinRoomSession(
    makeActiveFocus(),
    await makePreferredFoci(rtcSession, livekitAlias),
    encryptMedia,
  );
}

const widgetPostHangupProcedure = async (
  widget: WidgetHelpers,
): Promise<void> => {
  // we need to wait until the callEnded event is tracked on posthog.
  // Otherwise the iFrame gets killed before the callEnded event got tracked.
  await new Promise((resolve) => window.setTimeout(resolve, 10)); // 10ms
  widget.api.setAlwaysOnScreen(false);
  PosthogAnalytics.instance.logout();

  // We send the hangup event after the memberships have been updated
  // calling leaveRTCSession.
  // We need to wait because this makes the client hosting this widget killing the IFrame.
  widget.api.transport.send(ElementWidgetActions.HangupCall, {});
};

export async function leaveRTCSession(
  rtcSession: MatrixRTCSession,
): Promise<void> {
  await rtcSession.leaveRoomSession();
  if (widget) {
    await widgetPostHangupProcedure(widget);
  }
}

// Query focus from other room members

// This caches the homeserver domains per homeserver.
const livekitFocusCache = new Map<string, LivekitFocusConfig | undefined>();

// helper to fetch the domain from a member
const getDomain = (member: RoomMember): string => member.userId.split(":")[1];

async function fetchAndCacheLivekitFocus(
  homeserverDomain: string,
): Promise<LivekitFocusConfig | undefined> {
  const cachedHomeserverFocus = livekitFocusCache.get(homeserverDomain);
  if (cachedHomeserverFocus) return cachedHomeserverFocus;

  const fetchedHomeserverFocus = (
    await AutoDiscovery.getRawClientConfig(homeserverDomain)
  )[LIVEKIT_FOCUS_WK_KEY] as LivekitFocusConfig | undefined;
  // also store undefined so we don't refetch each time.
  livekitFocusCache.set(homeserverDomain, fetchedHomeserverFocus);
  return fetchedHomeserverFocus;
}

async function focusFromOtherMembers(
  rtcSession: MatrixRTCSession,
  livekitAlias: string,
  skip?: boolean,
): Promise<LivekitFocus> {
  if (skip) throw Error("skipping");
  // Temporary convert to set to remove duplicates
  const memberDomains = Array.from(
    new Set(rtcSession.room.getMembers().map(getDomain)),
  );

  const possibleLivekitFocus = new Map(
    await Promise.all(
      memberDomains.map(
        async (domain: string) =>
          [domain, await fetchAndCacheLivekitFocus(domain)] as [
            string,
            LivekitFocusConfig | undefined,
          ],
      ),
    ),
  );

  const validFocus = (
    s: [string, LivekitFocusConfig | undefined],
  ): s is [string, LivekitFocusConfig] => !!s[1];

  // TODO this is a placeholder that sorts alphabetically.
  // In the future we want to use this, to allow smart SFU selection (based on ping, load endpoints, etc.)
  const betterSFU = (
    a: [string, LivekitFocusConfig],
    b: [string, LivekitFocusConfig],
  ): number => (a[0] < b[0] ? -1 : 1);

  const [domain, config] = Array.from(possibleLivekitFocus.entries())
    .filter(validFocus)
    .sort(betterSFU)[0];
  if (!config) {
    throw new Error("No focus can be loaded from other users home-servers!");
  } else {
    logger.log("Using livekit Focus: ", config, `\nfrom homeserver: ${domain}`);
  }
  return { ...config, livekit_alias: livekitAlias };
}
