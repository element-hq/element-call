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
import { AutoDiscovery, Room, RoomMember } from "matrix-js-sdk";
import { logger } from "matrix-js-sdk/src/logger";

import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import { LivekitFocus } from "./livekit/LivekitFocus";
import { Config } from "./config/Config";
import { ElementWidgetActions, WidgetHelpers, widget } from "./widget";

const LIVEKIT_SERVICE_URL_WK_KEY = "livekit_service_url";

// This caches the homeserver domains per homeserver.
const livekitServiceUrlCache = new Map<string, string | undefined>();

const getDomain = (member: RoomMember): string => member.userId.split(":")[1];

async function fetchAndCacheLivekitServiceUrl(
  homeserverDomain: string,
): Promise<string | undefined> {
  const guestDomain = livekitServiceUrlCache.get(homeserverDomain);
  if (guestDomain) return guestDomain;
  let fetchedGuestDomain = (
    await AutoDiscovery.getRawClientConfig(homeserverDomain)
  )[LIVEKIT_SERVICE_URL_WK_KEY] as string | undefined;
  // hack for now since we don't have a well known yet.
  if (homeserverDomain === "call-unstable.ems.host")
    fetchedGuestDomain = "call-unstable.ems.host";
  // also store undefined so we don't refetch each time.
  livekitServiceUrlCache.set(homeserverDomain, fetchedGuestDomain);
  return fetchedGuestDomain;
}

async function makeFocus(
  livekitAlias: string,
  room: Room,
): Promise<LivekitFocus> {
  logger.log("Trying to make a new Focus (sfu) for room: ", room.roomId);
  const focusFromUrl = (url: string): LivekitFocus => ({
    type: "livekit",
    livekit_service_url: url,
    livekit_alias: livekitAlias,
  });
  // prioritize the client well known over the configured sfu.
  const wellKnownSfuUrl =
    room.client.getClientWellKnown()?.[LIVEKIT_SERVICE_URL_WK_KEY];

  const urlFromConf =
    wellKnownSfuUrl ?? Config.get().livekit!.livekit_service_url;

  if (urlFromConf) {
    logger.log(
      "Using livekit SFU url from",
      wellKnownSfuUrl ? "well known." : "config.",
      "\n url: ",
      urlFromConf,
    );
    return focusFromUrl(urlFromConf);
  }

  // Temporary convert to set to remove duplicates
  const memberDomains = Array.from(new Set(room.getMembers().map(getDomain)));

  interface SfuInfo {
    domain: string;
    url: string;
  }
  interface MaybeSfuInfo {
    domain: string;
    url: string | undefined;
  }

  const possibleLivekitServiceUrl = await Promise.all(
    memberDomains.map(async (domain: string) => ({
      domain,
      url: await fetchAndCacheLivekitServiceUrl(domain),
    })),
  );
  const isValidSfuInfo = (s: MaybeSfuInfo): s is SfuInfo => !!s.url;
  // TODO this is a placeholder that sorts alphabetically.
  // In the future we want to use this, to allow smart SFU selection (based on ping, load endpoints, etc.)
  const betterSFU = (a: SfuInfo, b: SfuInfo): number =>
    a.domain < b.domain ? -1 : 1;
  const sfuFormOtherUsers = possibleLivekitServiceUrl
    .filter(isValidSfuInfo)
    .sort(betterSFU)[0];

  if (!sfuFormOtherUsers) {
    throw new Error(
      "No livekit_service_url is configured or can be loaded from other users homeservers!",
    );
  } else {
    logger.log(
      "Using livekit SFU url from another users homeserver: ",
      sfuFormOtherUsers.domain,
      "\n url: ",
      sfuFormOtherUsers.url,
    );
  }
  return focusFromUrl(sfuFormOtherUsers.url);
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
    [await makeFocus(livekitAlias, rtcSession.room)],
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
