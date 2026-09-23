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

/** The live level of a microphone, captured only while `active`. */
export function useMicrophoneLevel(
  deviceId: string | undefined,
  active: boolean,
): MicrophoneState {
  const [state, setState] = useState<MicrophoneState>(IDLE);

  useEffect(() => {
    if (!active) return;
    // Idle first, so a new device doesn't start from the previous level.
    setState(IDLE);
    const subscription = observeMicrophoneState$(deviceId).subscribe(setState);
    return (): void => subscription.unsubscribe();
  }, [deviceId, active]);

  return state;
}
