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

import { ReactNode, useCallback } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { useTranslation } from "react-i18next";
import { MatrixRTCSession } from "matrix-js-sdk/src/matrixrtc/MatrixRTCSession";
import { MatrixError } from "matrix-js-sdk";
import { useHistory } from "react-router-dom";
import { Link } from "@vector-im/compound-web";

import { useLoadGroupCall } from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";

interface Props {
  client: MatrixClient;
  roomIdOrAlias: string;
  viaServers: string[];
  children: (rtcSession: MatrixRTCSession) => ReactNode;
}

export function GroupCallLoader({
  client,
  roomIdOrAlias,
  viaServers,
  children,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const groupCallState = useLoadGroupCall(client, roomIdOrAlias, viaServers);

  const history = useHistory();
  const onHomeClick = useCallback(() => history.push("/"), [history]);

  switch (groupCallState.kind) {
    case "loading":
      return (
        <FullScreenView>
          <h1>{t("Loading…")}</h1>
        </FullScreenView>
      );
    case "loaded":
      return <>{children(groupCallState.rtcSession)}</>;
    case "failed":
      if ((groupCallState.error as MatrixError).errcode === "M_NOT_FOUND") {
        return (
          <FullScreenView>
            <h1>{t("Call not found")}</h1>
            <p>
              {t(
                "Calls are now end-to-end encrypted and need to be created from the home page. This helps make sure everyone's using the same encryption key."
              )}
            </p>
            {/* XXX: A 'create it for me' button would be the obvious UX here. Two screens already have
            dupes of this flow, let's make a common component and put it here. */}
            <Link href="/" onClick={onHomeClick}>
              {t("Home")}
            </Link>
          </FullScreenView>
        );
      } else {
        return <ErrorView error={groupCallState.error} />;
      }
  }
}
