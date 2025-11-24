/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { of } from "rxjs";

import { loadClient } from "../src/ClientContext.tsx";
import { createCallViewModel$ } from "../src/state/CallViewModel/CallViewModel.ts";
import { MuteStates } from "../src/state/MuteStates.ts";
import { ObservableScope } from "../src/state/ObservableScope.ts";
import { getUrlParams } from "../src/UrlParams.ts";
import { MediaDevices } from "../src/state/MediaDevices";
import { constant } from "../src/state/Behavior.ts";
import { E2eeType } from "../src/e2ee/e2eeType.ts";

console.log("test Godot EC export");

export async function start(): Promise<void> {
  const initResults = await loadClient();
  if (initResults === null) {
    console.error("could not init client");
    return;
  }
  const { client } = initResults;
  const scope = new ObservableScope();
  const { roomId } = getUrlParams();
  if (roomId === null) {
    console.error("could not get roomId from url params");
    return;
  }
  const room = client.getRoom(roomId);
  if (room === null) {
    console.error("could not get room from client");
    return;
  }
  const mediaDevices = new MediaDevices(scope);
  const muteStates = new MuteStates(scope, mediaDevices, constant(true));
  const callViewModel = createCallViewModel$(
    scope,
    client.matrixRTC.getRoomSession(room),
    room,
    mediaDevices,
    muteStates,
    { encryptionSystem: { kind: E2eeType.PER_PARTICIPANT } },
    of({}),
    of({}),
    constant({ supported: false, processor: undefined }),
  );
  callViewModel.join();
  // callViewModel.audioParticipants$.pipe(
  //   switchMap((lkRooms) => {
  //     for (const item of lkRooms) {
  //       item.livekitRoom.registerTextStreamHandler;
  //     }
  //   }),
  // );
}
// Example default godot export

// <!DOCTYPE html>
// <html>
//     <head>
//         <title>My Template</title>
//         <meta charset="UTF-8">
//     </head>
//     <body>
//         <canvas id="canvas"></canvas>
//         <script src="$GODOT_URL"></script>
//         <script>
//             var engine = new Engine($GODOT_CONFIG);
//             engine.startGame();
//         </script>
//     </body>
// </html>
