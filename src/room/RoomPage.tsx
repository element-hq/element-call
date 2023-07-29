/*
Copyright 2021-2023 New Vector Ltd

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

import { FC, useEffect, useState, useCallback } from "react";

import type { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { useClientLegacy } from "../ClientContext";
import { ErrorView, LoadingView } from "../FullScreenView";
import { RoomAuthView } from "./RoomAuthView";
import { GroupCallLoader } from "./GroupCallLoader";
import { GroupCallView } from "./GroupCallView";
import { useUrlParams } from "../UrlParams";
import { useRegisterPasswordlessUser } from "../auth/useRegisterPasswordlessUser";
import { useOptInAnalytics } from "../settings/useSetting";
import { useHistory } from "react-router-dom";

export const RoomPage: FC = () => {
  const history = useHistory();

  const {
    roomAlias,
    roomId,
    viaServers,
    isEmbedded,
    preload,
    hideHeader,
    isPtt,
    displayName,
  } = useUrlParams();
  const roomIdOrAlias = roomId ?? roomAlias;
  if (!roomIdOrAlias) {
    history.push("/");
    console.error("No room specified");
    return null;
  }

  const [optInAnalytics, setOptInAnalytics] = useOptInAnalytics();
  const { registerPasswordlessUser } = useRegisterPasswordlessUser();
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    // During the beta, opt into analytics by default
    if (optInAnalytics === null && setOptInAnalytics) setOptInAnalytics(true);
  }, [optInAnalytics, setOptInAnalytics]);

  const { loading, authenticated, client, error, passwordlessUser } =
    useClientLegacy();

  useEffect(() => {
    // If we've finished loading, are not already authed and we've been given a display name as
    // a URL param, automatically register a passwordless user
    if (!loading && !authenticated && displayName) {
      setIsRegistering(true);
      registerPasswordlessUser(displayName).finally(() => {
        setIsRegistering(false);
      });
    }
  }, [
    loading,
    authenticated,
    displayName,
    setIsRegistering,
    registerPasswordlessUser,
  ]);

  const groupCallView = useCallback(
    (groupCall: GroupCall) => (
      <GroupCallView
        client={client!}
        groupCall={groupCall}
        isPasswordlessUser={passwordlessUser}
        isEmbedded={isEmbedded}
        preload={preload}
        hideHeader={hideHeader}
      />
    ),
    [client, passwordlessUser, isEmbedded, preload, hideHeader]
  );

  if (loading || isRegistering) {
    return <LoadingView />;
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  if (!client) {
    return <RoomAuthView />;
  }

  return (
    <GroupCallLoader
      client={client}
      roomIdOrAlias={roomIdOrAlias}
      viaServers={viaServers}
      createPtt={isPtt}
    >
      {groupCallView}
    </GroupCallLoader>
  );
};
