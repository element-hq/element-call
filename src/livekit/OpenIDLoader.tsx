/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { MatrixClient } from "matrix-js-sdk";
import React, { useEffect, useState } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { SFUConfig, getSFUConfigWithOpenID } from "./openIDSFU";
import { ErrorView, LoadingView } from "../FullScreenView";
import { ActiveCall, InCallViewProps } from "../room/InCallView";
import { UserChoices } from "./useLiveKit";

interface Props extends Omit<InCallViewProps, "livekitRoom"> {
  client: MatrixClient;
  roomName: string;
  userChoices: UserChoices;
}

export function OpenIDLoader({ client, roomName, ...rest }: Props) {
  const [sfuConfig, setSFUConfig] = useState<SFUConfig>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    (async () => {
      try {
        const result = await getSFUConfigWithOpenID(client, roomName);
        setSFUConfig(result);
      } catch (e) {
        logger.error("Failed to fetch SFU config: ", e);
        setError(new Error("Failed to fetch SFU config"));
      }
    })();
  }, [client, roomName]);

  if (error) {
    return <ErrorView error={error} />;
  } else if (sfuConfig) {
    return <ActiveCall client={client} sfuConfig={sfuConfig} {...rest} />;
  } else {
    return <LoadingView />;
  }
}
