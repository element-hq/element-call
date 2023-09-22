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

import { PosthogAnalytics } from "./analytics/PosthogAnalytics";
import { LivekitFocus } from "./livekit/LivekitFocus";
import { Config } from "./config/Config";

function makeFocus(livekitAlias: string): LivekitFocus {
  const urlFromConf = Config.get().livekit!.livekit_service_url;
  if (!urlFromConf) {
    throw new Error("No livekit_service_url is configured!");
  }

  return {
    type: "livekit",
    livekit_service_url: urlFromConf,
    livekit_alias: livekitAlias,
  };
}

export function enterRTCSession(rtcSession: MatrixRTCSession): void {
  PosthogAnalytics.instance.eventCallEnded.cacheStartCall(new Date());
  PosthogAnalytics.instance.eventCallStarted.track(rtcSession.room.roomId);

  // This must be called before we start trying to join the call, as we need to
  // have started tracking by the time calls start getting created.
  //groupCallOTelMembership?.onJoinCall();

  // right now we asume everything is a room-scoped call
  const livekitAlias = rtcSession.room.roomId;

  rtcSession.joinRoomSession([makeFocus(livekitAlias)]);
}

export function leaveRTCSession(rtcSession: MatrixRTCSession): void {
  //groupCallOTelMembership?.onLeaveCall();
  rtcSession.leaveRoomSession();
}
