/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useTranslation } from "react-i18next";
import { type FC } from "react";

import { useClientSessionState } from "../ClientContext";
import { ErrorPage, LoadingPage } from "../FullScreenView";
import { UnauthenticatedView } from "./UnauthenticatedView";
import { RegisteredView } from "./RegisteredView";
import { type ClientManager } from "../state/ClientSession";
import { usePageTitle } from "../usePageTitle";

interface Props {
  /** Null where the session is a host's and not ours to manage. */
  clientManager: ClientManager | null;
}

export const HomePage: FC<Props> = ({ clientManager }) => {
  const { t } = useTranslation();
  usePageTitle(t("common.home"));

  const session = useClientSessionState();

  switch (session.state) {
    case "loading":
      return <LoadingPage />;
    case "error":
      return <ErrorPage error={session.error} />;
    case "signedIn":
      return (
        <RegisteredView client={session.client} clientManager={clientManager} />
      );
    case "signedOut":
      // A host's session cannot be signed in to from here
      return clientManager === null ? (
        <ErrorPage error={new Error("Signed out of the host's session")} />
      ) : (
        <UnauthenticatedView clientManager={clientManager} />
      );
  }
};
