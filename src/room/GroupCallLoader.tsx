/*
Copyright 2022 New Vector Ltd

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

import { ReactNode } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { GroupCall } from "matrix-js-sdk/src/webrtc/groupCall";
import { useTranslation } from "react-i18next";

import { useLoadGroupCall } from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";

interface Props {
  client: MatrixClient;
  roomIdOrAlias: string;
  viaServers: string[];
  children: (groupCall: GroupCall) => ReactNode;
  createPtt: boolean;
}

export function GroupCallLoader({
  client,
  roomIdOrAlias,
  viaServers,
  children,
  createPtt,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const groupCallState = useLoadGroupCall(
    client,
    roomIdOrAlias,
    viaServers,
    createPtt
  );

  switch (groupCallState.kind) {
    case "loading":
      return (
        <FullScreenView>
          <h1>{t("Loading…")}</h1>
        </FullScreenView>
      );
    case "loaded":
      return <>{children(groupCallState.groupCall)}</>;
    case "failed":
      return <ErrorView error={groupCallState.error} />;
  }
}
