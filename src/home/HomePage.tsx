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
import { usePageTitle } from "../usePageTitle";

export const HomePage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("common.home"));

  const session = useClientSessionState();

  switch (session.state) {
    case "loading":
      return <LoadingPage />;
    case "error":
      return <ErrorPage error={session.error} />;
    case "signedIn":
      return <RegisteredView client={session.client} />;
    case "signedOut":
      return <UnauthenticatedView />;
  }
};
