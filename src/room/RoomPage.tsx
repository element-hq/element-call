/*
Copyright 2021 New Vector Ltd

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

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import { useClient } from "../ClientContext";
import { ErrorView, LoadingView } from "../FullScreenView";
import { RoomAuthView } from "./RoomAuthView";
import { GroupCallLoader } from "./GroupCallLoader";
import { GroupCallView } from "./GroupCallView";
import { MediaHandlerProvider } from "../settings/useMediaHandler";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";

export function RoomPage() {
  const { loading, isAuthenticated, error, client, isPasswordlessUser } =
    useClient();

  const { roomId: maybeRoomId } = useParams();
  const { hash, search }: { hash: string; search: string } = useLocation();
  const [viaServers, isEmbedded, isPtt, displayName] = useMemo(() => {
    const params = new URLSearchParams(search);
    return [
      params.getAll("via"),
      params.has("embed"),
      params.get("ptt") === "true",
      params.get("displayName"),
    ];
  }, [search]);
  const roomId = (maybeRoomId || hash || "").toLowerCase();
  const { registerPasswordlessUser, recaptchaId } =
    useRegisterPasswordlessUser();
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    // If we're not already authed and we've been given a display name as
    // a URL param, automatically register a passwordless user
    if (!isAuthenticated && displayName) {
      setIsRegistering(true);
      registerPasswordlessUser(displayName).finally(() => {
        setIsRegistering(false);
      });
    }
  }, [
    isAuthenticated,
    displayName,
    setIsRegistering,
    registerPasswordlessUser,
  ]);

  if (loading || isRegistering) {
    return <LoadingView />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  if (!isAuthenticated) {
    return <RoomAuthView />;
  }

  return (
    <MediaHandlerProvider client={client}>
      <GroupCallLoader
        client={client}
        roomId={roomId}
        viaServers={viaServers}
        createPtt={isPtt}
      >
        {(groupCall) => (
          <GroupCallView
            client={client}
            roomId={roomId}
            groupCall={groupCall}
            isPasswordlessUser={isPasswordlessUser}
            isEmbedded={isEmbedded}
          />
        )}
      </GroupCallLoader>
    </MediaHandlerProvider>
  );
}
