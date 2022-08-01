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

import React, { ReactNode } from "react";
import { GroupCall, MatrixClient } from "matrix-js-sdk";

import { useLoadGroupCall } from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";
import { usePageTitle } from "../usePageTitle";

interface Props {
  client: MatrixClient;
  roomId: string;
  viaServers: string[];
  children: (groupCall: GroupCall) => ReactNode;
  createPtt: boolean;
}

export function GroupCallLoader({
  client,
  roomId,
  viaServers,
  children,
  createPtt,
}: Props): JSX.Element {
  const { loading, error, groupCall } = useLoadGroupCall(
    client,
    roomId,
    viaServers,
    createPtt
  );

  usePageTitle(groupCall ? groupCall.room.name : "Loading...");

  if (loading) {
    return (
      <FullScreenView>
        <h1>Loading room...</h1>
      </FullScreenView>
    );
  }

  if (error) {
    return <ErrorView error={error} />;
  }

  return <>{children(groupCall)}</>;
}
