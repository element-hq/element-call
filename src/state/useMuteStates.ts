/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

import { MuteStates } from "./MuteStates";
import { ObservableScope } from "./ObservableScope";
import { calculateInitialMuteState } from "./initialMuteState";
import { useMediaDevices } from "../MediaDevicesContext";
import { useHostBridge } from "../HostBridge";
import { useUrlParams } from "../UrlParams";

/**
 * Audio and video mute state, kept in step with the host.
 *
 * `null` until the media devices have been looked at, since what the user
 * starts muted depends on what they have.
 *
 * Whoever shows the user their own camera owns one of these. Note there should
 * only ever be one alive at a time: each reports the user's mute state to the
 * host, so two would have them talking over each other.
 */
export function useMuteStates(): MuteStates | null {
  const urlParams = useUrlParams();
  const hostBridge = useHostBridge();
  const devices = useMediaDevices();
  const [muteStates, setMuteStates] = useState<MuteStates | null>(null);

  useEffect(() => {
    const scope = new ObservableScope();
    setMuteStates(
      new MuteStates(
        scope,
        devices,
        calculateInitialMuteState(
          urlParams.skipLobby,
          urlParams.callIntent,
          urlParams.isWidget,
        ),
        hostBridge,
      ),
    );
    return (): void => scope.end();
  }, [devices, urlParams, hostBridge]);

  return muteStates;
}
