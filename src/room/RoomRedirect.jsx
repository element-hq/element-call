import React, { useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { defaultHomeserverHost } from "../ConferenceCallManagerHooks";
import { LoadingView } from "../FullScreenView";

export function RoomRedirect() {
  const { pathname } = useLocation();
  const history = useHistory();

  useEffect(() => {
    let roomId = pathname;

    if (pathname.startsWith("/")) {
      roomId = roomId.substr(1, roomId.length);
    }

    if (!roomId.startsWith("#") && !roomId.startsWith("!")) {
      roomId = `#${roomId}:${defaultHomeserverHost}`;
    }

    history.replace(`/room/${roomId}`);
  }, [pathname, history]);

  return <LoadingView />;
}
