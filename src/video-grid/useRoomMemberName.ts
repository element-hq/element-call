/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { RoomMember, RoomMemberEvent } from "matrix-js-sdk";
import { useState, useEffect } from "react";

interface RoomMemberName {
  name: string;
  rawDisplayName: string;
}
export function useRoomMemberName(member: RoomMember): RoomMemberName {
  const [state, setState] = useState<RoomMemberName>({
    name: member.name,
    rawDisplayName: member.rawDisplayName,
  });

  useEffect(() => {
    function updateName() {
      setState({ name: member.name, rawDisplayName: member.rawDisplayName });
    }

    updateName();

    member.on(RoomMemberEvent.Name, updateName);

    return () => {
      member.removeListener(RoomMemberEvent.Name, updateName);
    };
  }, [member]);

  return state;
}
