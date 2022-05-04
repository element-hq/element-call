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

import { useState, useEffect } from "react";

export function useRoomMemberName(member) {
  const [state, setState] = useState({
    name: member.name,
    rawDisplayName: member.rawDisplayName,
  });

  useEffect(() => {
    function updateName() {
      setState({ name: member.name, rawDisplayName: member.rawDisplayName });
    }

    updateName();

    member.on("RoomMember.name", updateName);

    return () => {
      member.removeListener("RoomMember.name", updateName);
    };
  }, [member]);

  return state;
}
