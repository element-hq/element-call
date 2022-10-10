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

import React from "react";
import { useTranslation } from "react-i18next";

import { useClient } from "../ClientContext";
import { ErrorView, LoadingView } from "../FullScreenView";
import { UnauthenticatedView } from "./UnauthenticatedView";
import { RegisteredView } from "./RegisteredView";
import { usePageTitle } from "../usePageTitle";

export function HomePage() {
  const { t } = useTranslation();
  usePageTitle(t("Home"));

  const { isAuthenticated, isPasswordlessUser, loading, error, client } =
    useClient();

  if (loading) {
    return <LoadingView />;
  } else if (error) {
    return <ErrorView error={error} />;
  } else {
    return isAuthenticated ? (
      <RegisteredView isPasswordlessUser={isPasswordlessUser} client={client} />
    ) : (
      <UnauthenticatedView />
    );
  }
}
