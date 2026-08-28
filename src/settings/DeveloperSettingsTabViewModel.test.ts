/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";
import { BehaviorSubject } from "rxjs";

import { testScope } from "../utils/test";
import { type CallViewModel } from "../state/CallViewModel/CallViewModel";
import {
  createDeveloperSettingsTabViewModel,
  outOfCallDeveloperSettingsTabViewModel,
} from "./DeveloperSettingsTabViewModel";

describe("createDeveloperSettingsTabViewModel", () => {
  it("projects the key rotation state of the call", () => {
    const keyRotationSuppressed$ = new BehaviorSubject(false);
    const participantCount$ = new BehaviorSubject(5);
    const vm = createDeveloperSettingsTabViewModel(testScope(), {
      keyRotationSuppressed$,
      participantCount$,
    } as unknown as CallViewModel);

    expect(vm.keyRotation$.value).toEqual({
      suppressed: false,
      participantCount: 5,
    });

    participantCount$.next(50);
    keyRotationSuppressed$.next(true);

    expect(vm.keyRotation$.value).toEqual({
      suppressed: true,
      participantCount: 50,
    });
  });
});

describe("outOfCallDeveloperSettingsTabViewModel", () => {
  it("has no key rotation state", () => {
    expect(outOfCallDeveloperSettingsTabViewModel.keyRotation$.value).toBe(
      null,
    );
  });
});
