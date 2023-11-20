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

import { useTranslation } from "react-i18next";
import { FC } from "react";

import { useClientState } from "../ClientContext";
import { ErrorView, LoadingView } from "../FullScreenView";
import { UnauthenticatedView } from "./UnauthenticatedView";
import { RegisteredView } from "./RegisteredView";
import { usePageTitle } from "../usePageTitle";

export const HomePage: FC = () => {
  const { t } = useTranslation();
  usePageTitle(t("common.home"));

  const clientState = useClientState();

  if (!clientState) {
    return <LoadingView />;
  } else if (clientState.state === "error") {
    return <ErrorView error={clientState.error} />;
  } else {
    return clientState.authenticated ? (
      <RegisteredView client={clientState.authenticated.client} />
    ) : (
      <UnauthenticatedView />
    );
  }
};
