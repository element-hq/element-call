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

import { LocalParticipant, RemoteParticipant } from "livekit-client";
import { RoomMember } from "matrix-js-sdk/src/matrix";

export abstract class TileViewModel {
  // TODO: Properly separate the data layer from the UI layer by keeping the
  // member and LiveKit participant objects internal. The only LiveKit-specific
  // thing we need to expose here is a TrackReference for the video, everything
  // else should be simple strings, flags, and callbacks.
  public abstract readonly id: string;
  public abstract readonly member: RoomMember | undefined;
  public abstract readonly sfuParticipant: LocalParticipant | RemoteParticipant;
}

// Right now it looks kind of pointless to have user media and screen share be
// represented by two classes rather than a single flag, but this will come in
// handy when we go to move more business logic out of VideoTile and into this
// file

export class UserMediaTileViewModel extends TileViewModel {
  public constructor(
    public readonly id: string,
    public readonly member: RoomMember | undefined,
    public readonly sfuParticipant: LocalParticipant | RemoteParticipant,
  ) {
    super();
  }
}

export class ScreenShareTileViewModel extends TileViewModel {
  public constructor(
    public readonly id: string,
    public readonly member: RoomMember | undefined,
    public readonly sfuParticipant: LocalParticipant | RemoteParticipant,
  ) {
    super();
  }
}
