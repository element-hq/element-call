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

import React, { useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";

import { Config } from "../config/Config";
import { LoadingView } from "../FullScreenView";

// A component that, when loaded, redirects the client to a full room URL
// based on the current URL being an abbreviated room URL
export function RoomRedirect() {
  const { pathname } = useLocation();
  const history = useHistory();

  useEffect(() => {
    let roomId = pathname;

    if (pathname.startsWith("/")) {
      roomId = roomId.substring(1, roomId.length);
    }

    if (!roomId.startsWith("#") && !roomId.startsWith("!")) {
      roomId = `#${roomId}:${Config.defaultServerName()}`;
    }

    history.replace(`/room/${roomId.toLowerCase()}`);
  }, [pathname, history]);

  return <LoadingView />;
}
