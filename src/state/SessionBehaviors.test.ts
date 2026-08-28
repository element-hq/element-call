/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from "vitest";
import { MatrixRTCSessionEvent } from "matrix-js-sdk/lib/matrixrtc";
import { EventEmitter } from "events";

import { createKeyRotationSuppressed$ } from "./SessionBehaviors";
import { ObservableScope } from "./ObservableScope";

describe("SessionBehaviors", () => {
  describe("createKeyRotationSuppressed$", () => {
    it("emits initial value from isKeyRotationSuppressed and updates when KeyRotationSuppressedChanged event is emitted", () => {
      const scope = new ObservableScope();
      const emitter = new EventEmitter();
      const mockSession = Object.assign(emitter, {
        on: vi.fn(),
        off: vi.fn(),
        isKeyRotationSuppressed: false,
      });

      const keyRotationSuppressed$ = createKeyRotationSuppressed$(
        scope,
        mockSession as any,
      );

      expect(keyRotationSuppressed$.value).toBe(false);
      emitter.emit(MatrixRTCSessionEvent.KeyRotationSuppressedChanged, true);

      expect(keyRotationSuppressed$.value).toBe(true);

      emitter.emit(MatrixRTCSessionEvent.KeyRotationSuppressedChanged, false);

      expect(keyRotationSuppressed$.value).toBe(false);
      scope.end();
    });
  });
});
