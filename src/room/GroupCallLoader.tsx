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
import { MatrixError } from "matrix-js-sdk";
import { useHistory } from "react-router-dom";
import { Heading, Link, Text } from "@vector-im/compound-web";

import {
  useLoadGroupCall,
  GroupCallStatus,
  CustomMessage,
} from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";

interface Props {
  client: MatrixClient;
  roomIdOrAlias: string;
  viaServers: string[];
  children: (groupCallState: GroupCallStatus) => ReactNode;
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
  const onHomeClick = useCallback(
    (ev: React.MouseEvent) => {
      ev.preventDefault();
      history.push("/");
    },
    [history],
  );

  switch (groupCallState.kind) {
    case "loaded":
    case "waitForInvite":
    case "canKnock":
      return <>{children(groupCallState)}</>;
    case "loading":
      return (
        <FullScreenView>
          <h1>{t("common.loading")}</h1>
        </FullScreenView>
      );
    case "failed":
      if ((groupCallState.error as MatrixError).errcode === "M_NOT_FOUND") {
        return (
          <FullScreenView>
            <Heading>{t("group_call_loader.failed_heading")}</Heading>
            <Text>{t("group_call_loader.failed_text")}</Text>
            {/* XXX: A 'create it for me' button would be the obvious UX here. Two screens already have
            dupes of this flow, let's make a common component and put it here. */}
            <Link href="/" onClick={onHomeClick}>
              {t("common.home")}
            </Link>
          </FullScreenView>
        );
      } else if (groupCallState.error instanceof CustomMessage) {
        return (
          <FullScreenView>
            <Heading>{groupCallState.error.messageTitle}</Heading>
            <Text>{groupCallState.error.message}</Text>
            <Link href="/" onClick={onHomeClick}>
              {t("common.home")}
            </Link>
          </FullScreenView>
        );
      } else {
        return <ErrorView error={groupCallState.error} />;
      }
  }
}
