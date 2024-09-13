/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { MatrixClient } from "matrix-js-sdk/src/client";
import { useTranslation } from "react-i18next";
import { MatrixError } from "matrix-js-sdk/src/matrix";
import { Heading, Text } from "@vector-im/compound-web";

import { Link } from "../button/Link";
import {
  useLoadGroupCall,
  GroupCallStatus,
  CallTerminatedMessage,
} from "./useLoadGroupCall";
import { ErrorView, FullScreenView } from "../FullScreenView";

interface Props {
  client: MatrixClient;
  roomIdOrAlias: string;
  viaServers: string[];
  children: (groupCallState: GroupCallStatus) => JSX.Element;
}

export function GroupCallLoader({
  client,
  roomIdOrAlias,
  viaServers,
  children,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const groupCallState = useLoadGroupCall(client, roomIdOrAlias, viaServers);

  switch (groupCallState.kind) {
    case "loaded":
    case "waitForInvite":
    case "canKnock":
      return children(groupCallState);
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
            <Link to="/">{t("common.home")}</Link>
          </FullScreenView>
        );
      } else if (groupCallState.error instanceof CallTerminatedMessage) {
        return (
          <FullScreenView>
            <Heading>{groupCallState.error.message}</Heading>
            <Text>{groupCallState.error.messageBody}</Text>
            {groupCallState.error.reason && (
              <>
                {t("group_call_loader.reason")}:
                <Text size="sm">"{groupCallState.error.reason}"</Text>
              </>
            )}
            <Link to="/">{t("common.home")}</Link>
          </FullScreenView>
        );
      } else {
        return <ErrorView error={groupCallState.error} />;
      }
  }
}
