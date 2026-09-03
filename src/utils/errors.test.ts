/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import {
  ErrorCategory,
  ErrorCode,
  FailToStartLivekitConnection,
  MembershipManagerError,
  NoMatrix2AuthorizationService,
  SFURoomCreationRestrictedError,
} from "./errors";

// These errors take their wording from Element Call's own i18next instance
// rather than the global one, so each needs to come out translated rather than
// as a raw key.
describe("localised errors", () => {
  test("MembershipManagerError describes the failure and keeps its cause", () => {
    const cause = new Error("the underlying problem");
    const error = new MembershipManagerError(cause);

    expect(error.code).toBe(ErrorCode.INTERNAL_MEMBERSHIP_MANAGER);
    expect(error.category).toBe(ErrorCategory.SYSTEM_FAILURE);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).not.toContain("error.");
    expect(error.cause).toBe(cause);
  });

  test("NoMatrix2AuthorizationService is a configuration problem", () => {
    const cause = new Error("404");
    const error = new NoMatrix2AuthorizationService(cause);

    expect(error.code).toBe(ErrorCode.NO_MATRIX_2_AUTHORIZATION_SERVICE);
    expect(error.category).toBe(ErrorCategory.CONFIGURATION_ISSUE);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).not.toContain("error.");
    expect(error.cause).toBe(cause);
  });

  test("FailToStartLivekitConnection passes its detail through", () => {
    const error = new FailToStartLivekitConnection("could not publish");

    expect(error.code).toBe(ErrorCode.FAILED_TO_START_LIVEKIT);
    expect(error.category).toBe(ErrorCategory.NETWORK_CONNECTIVITY);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).toBe("could not publish");
  });

  test("SFURoomCreationRestrictedError explains the restriction", () => {
    const error = new SFURoomCreationRestrictedError();

    expect(error.code).toBe(ErrorCode.SFU_ERROR);
    expect(error.category).toBe(ErrorCategory.CONFIGURATION_ISSUE);
    expect(error.localisedTitle).not.toContain("error.");
    expect(error.localisedMessage).not.toContain("error.");
  });
});
