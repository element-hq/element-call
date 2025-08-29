/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { completeAuthorizationCodeGrant, generateOidcAuthorizationUrl } from "matrix-js-sdk/src/oidc/authorize";
import { OidcClientConfig } from "matrix-js-sdk/src/matrix";
import { secureRandomString } from "matrix-js-sdk/src/randomstring";
import { type IdTokenClaims } from "oidc-client-ts";

import { getOidcCallbackUrl } from "./callbackUrl";
import { OidcClientError } from "./error";

/**
 * TODO: Mostly yoinked from element-web, so move to SDK if possible
 * 
 * Start OIDC authorization code flow
 * Generates auth params, stores them in session storage and
 * Navigates to configured authorization endpoint
 * @param delegatedAuthConfig from discovery
 * @param clientId this client's id as registered with configured issuer
 * @param homeserverUrl target homeserver
 * @returns Promise that resolves after we have navigated to auth endpoint
 */
export async function startOidcLogin(
    delegatedAuthConfig: OidcClientConfig,
    clientId: string,
    homeserverUrl: string,
    isRegistration?: boolean,
): Promise<void> {
  const redirectUri = getOidcCallbackUrl().href;

  const nonce = secureRandomString(10);

  const prompt = isRegistration ? "create" : undefined;

  const authorizationUrl = await generateOidcAuthorizationUrl({
    metadata: delegatedAuthConfig,
    redirectUri,
    clientId,
    homeserverUrl,
    identityServerUrl: undefined,
    nonce,
    prompt,
  });

  window.location.href = authorizationUrl;
}

// TODO: Mostly yoinked from element-web, so move to SDK if possible
type CompleteOidcLoginResponse = {
  // url of the homeserver selected during login
  homeserverUrl: string;
  // accessToken gained from OIDC token issuer
  accessToken: string;
  // refreshToken gained from OIDC token issuer, when falsy token cannot be refreshed
  refreshToken?: string;
  // idToken gained from OIDC token issuer
  idToken: string;
  // this client's id as registered with the OIDC issuer
  clientId: string;
  // issuer used during authentication
  issuer: string;
  // claims of the given access token; used during token refresh to validate new tokens
  idTokenClaims: IdTokenClaims;
};

/**
 * TODO: Mostly yoinked from element-web, so move to SDK if possible
 * 
 * Attempt to complete authorization code flow to get an access token
 * @param queryParams the query-parameters extracted from the real query-string of the starting URI.
 * @returns Promise that resolves with a CompleteOidcLoginResponse when login was successful
 * @throws When we failed to get a valid access token
 */
export async function completeOidcLogin(queryParams: URLSearchParams): Promise<CompleteOidcLoginResponse> {
    const code = queryParams.get("code");
    const state = queryParams.get("state");
    if (!code || !state) {
      throw new Error(OidcClientError.InvalidQueryParameters);
    }
    const { homeserverUrl, tokenResponse, idTokenClaims, oidcClientSettings } =
        await completeAuthorizationCodeGrant(code, state);

    return {
        homeserverUrl,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        idToken: tokenResponse.id_token,
        clientId: oidcClientSettings.clientId,
        issuer: oidcClientSettings.issuer,
        idTokenClaims,
    };
}