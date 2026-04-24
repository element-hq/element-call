/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Syncs the livekit log level with the "Enable extended Livekit logs" developer setting.
import { type FC, useEffect } from "react";
import { setLogLevel } from "livekit-client";

import { useSetting, enableExtendedLivekitLogs } from "./settings/settings.ts";

export const LivekitLogLevelSync: FC = () => {
  const [extendedLivekitLogs] = useSetting(enableExtendedLivekitLogs);

  useEffect(() => {
    setLogLevel(extendedLivekitLogs ? "trace" : "info");
  }, [extendedLivekitLogs]);

  return <></>;
};
