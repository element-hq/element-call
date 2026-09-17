/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

import {
  type MicrophoneState,
  observeMicrophoneState$,
} from "../state/MicrophoneLevel";

const IDLE: MicrophoneState = { type: "level", level: 0 };

/**
 * Reads the live input level of a microphone, while `active`.
 *
 * A bridge and nothing else: the capture, its lifetime and the maths belong to
 * {@link observeMicrophoneState$}. Scoped to `active` so the device is held
 * only while whatever shows the meter is on screen, rather than for the length
 * of a call.
 */
export function useMicrophoneLevel(
  deviceId: string | undefined,
  active: boolean,
): MicrophoneState {
  const [state, setState] = useState<MicrophoneState>(IDLE);

  useEffect(() => {
    if (!active) return;
    // Idle first, so a new device starts from nothing rather than from the
    // level the previous one was reading.
    setState(IDLE);
    const subscription = observeMicrophoneState$(deviceId).subscribe(setState);
    return (): void => subscription.unsubscribe();
  }, [deviceId, active]);

  return state;
}
