/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * TODO: Yoinked from element-web, so move to SDK if possible
 * 
 * Errors thrown by EC during OIDC native flow authentication.
 * Intended to be logged, not read by users.
 */
export enum OidcClientError {
    InvalidQueryParameters = "Invalid query parameters for OIDC native login. `code` and `state` are required.",
}