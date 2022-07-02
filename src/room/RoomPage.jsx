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

import React, { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useClient } from "../ClientContext";
import { ErrorView, LoadingView } from "../FullScreenView";
import { RoomAuthView } from "./RoomAuthView";
import { GroupCallLoader } from "./GroupCallLoader";
import { GroupCallView } from "./GroupCallView";
import { MediaHandlerProvider } from "../settings/useMediaHandler";

export function RoomPage() {
  const { loading, isAuthenticated, error, client, isPasswordlessUser } =
    useClient();

  const { roomId: maybeRoomId } = useParams();
  const { hash, search } = useLocation();
  const [viaServers, isEmbedded] = useMemo(() => {
    const params = new URLSearchParams(search);
    return [params.getAll("via"), params.has("embed")];
  }, [search]);
  const roomId = (maybeRoomId || hash || "").toLowerCase();

  if (loading) {
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
      <GroupCallLoader client={client} roomId={roomId} viaServers={viaServers}>
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
