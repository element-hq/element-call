/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useTranslation } from "react-i18next";
import { type FC } from "react";

import { useClientState } from "../ClientContext";
import { ErrorPage, LoadingPage } from "../FullScreenView";
import { UnauthenticatedView } from "./UnauthenticatedView";
import { RegisteredView } from "./RegisteredView";
import { usePageTitle } from "../usePageTitle";
import { widget } from "../widget.ts";

export const HomePage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("common.home"));

  const clientState = useClientState();

  if (!clientState) {
    return <LoadingPage />;
  } else if (clientState.state === "error") {
    return <ErrorPage widget={widget} error={clientState.error} />;
  } else {
    return clientState.authenticated ? (
      <RegisteredView client={clientState.authenticated.client} />
    ) : (
      <UnauthenticatedView />
    );
  }
};
