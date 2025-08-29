/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/src/logger";
import { registerOidcClient, type OidcClientConfig } from "matrix-js-sdk";

import { ConfigOptions } from "../../config/ConfigOptions";
import { Config } from "../../config/Config";
import { getOidcCallbackUrl } from "./callbackUrl";

/**
 * TODO: Mostly yoinked from element-web, so move to SDK if possible
 * 
 * Get the statically configured clientId for the issuer
 * @param issuer delegated auth OIDC issuer
 * @param staticOidcClients static client config from config.json
 * @returns clientId if found, otherwise undefined
 */
function getStaticOidcClientId(
  issuer: string,
  staticOidcClients?: ConfigOptions["oidc_static_clients"],
): string | undefined {
    // static_oidc_clients are configured with a trailing slash
    const issuerWithTrailingSlash = issuer.endsWith("/") ? issuer : issuer + "/";
    return staticOidcClients?.[issuerWithTrailingSlash]?.client_id;
}

/**
 * TODO: Mostly yoinked from element-web, so move to SDK if possible
 * 
 * Get the statically configured clientId for an OIDC OP
 * @param delegatedAuthConfig Auth config from OP
 * @returns resolves with clientId
 * @throws if no clientId is found
 */
export async function getOidcClientId(
  delegatedAuthConfig: OidcClientConfig,
): Promise<string> {
  const config = Config.get();
  const staticClientId = getStaticOidcClientId(delegatedAuthConfig.issuer, config.oidc_static_clients);
  if (staticClientId) {
    logger.debug(`Using static clientId for issuer ${delegatedAuthConfig.issuer}`);
    return staticClientId;
  }
  return await registerOidcClient(
    delegatedAuthConfig,
    {
      clientName: config.oidc_metadata?.client_name ?? "Element Call",
      clientUri: config.oidc_metadata?.client_uri ?? window.location.origin,
      redirectUris: [getOidcCallbackUrl().href],
      applicationType: "web",
      contacts: config.oidc_metadata?.contacts,
      tosUri: config.oidc_metadata?.tos_uri,
      policyUri: config.oidc_metadata?.policy_uri,
    },
  );
}