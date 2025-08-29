/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useState, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createClient, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { useClient } from "../ClientContext";
import { usePageTitle } from "../usePageTitle";
import { completeOidcLogin } from "../utils/oidc/authorize";
import { initClient } from "../utils/matrix";

/**
 * TODO: Yoinked from element-web, so move to SDK if possible
 * Gets information about the owner of a given access token.
 * @returns Promise that resolves with whoami response
 * @throws when whoami request fails
 */
async function getUserIdFromAccessToken(
  accessToken: string,
  homeserverUrl: string,
): Promise<ReturnType<MatrixClient["whoami"]>> {
  try {
    const client = createClient({
      baseUrl: homeserverUrl,
      accessToken: accessToken,
    });

    return await client.whoami();
  } catch (error) {
    throw new Error("Failed to retrieve userId using accessToken");
  }
}

export const OidcRedirectPage: FC = async () => {
  const { t } = useTranslation();
  // TODO: probably want a new page title
  usePageTitle(t("login_title"));

  const navigate = useNavigate();
  const location = useLocation();
  const [_, setError] = useState<Error>();

  const { setClient } = useClient();
  if (!setClient) {
    return;
  }

  // TODO: make reactive
  try {
    const queryParams = new URLSearchParams(location.search);
    const { accessToken, refreshToken, homeserverUrl, idToken, clientId, issuer } =
      await completeOidcLogin(queryParams);

    const {
      user_id: userId,
      device_id: deviceId,
    } = await getUserIdFromAccessToken(accessToken, homeserverUrl);

    const session = {
      user_id: userId,
      access_token: accessToken,
      device_id: deviceId!, // TODO: make sure this really is always defined
      passwordlessUser: false,
    };

    console.debug(`TODO: use ${refreshToken}`);
    const client = await initClient(
      {
        baseUrl: homeserverUrl,
        accessToken,
        userId,
        deviceId,
      },
      false,
    );
    setClient(client, session);
    console.debug(`TODO: use ${clientId}, ${issuer}, ${idToken}`);
    // persistOidcAuthenticatedSettings(clientId, issuer, idToken);

    const locationState = location.state;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (locationState && locationState.from) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await navigate(locationState.from);
    } else {
      await navigate("/");
    }
  } catch (error: any) {
    setError(error);
    return;
  }

  return (
    <></>
  );
}