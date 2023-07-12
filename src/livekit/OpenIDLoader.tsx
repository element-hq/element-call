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

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { logger } from "matrix-js-sdk/src/logger";

import {
  OpenIDClientParts,
  SFUConfig,
  getSFUConfigWithOpenID,
} from "./openIDSFU";
import { ErrorView, LoadingView } from "../FullScreenView";

interface Props {
  client: OpenIDClientParts;
  livekitServiceURL: string;
  roomName: string;
  children: ReactNode;
}

const SFUConfigContext = createContext<SFUConfig | undefined>(undefined);

export const useSFUConfig = () => useContext(SFUConfigContext);

export function OpenIDLoader({
  client,
  livekitServiceURL,
  roomName,
  children,
}: Props) {
  const [state, setState] = useState<
    SFUConfigLoading | SFUConfigLoaded | SFUConfigFailed
  >({ kind: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const result = await getSFUConfigWithOpenID(
          client,
          livekitServiceURL,
          roomName
        );
        setState({ kind: "loaded", sfuConfig: result });
      } catch (e) {
        logger.error("Failed to fetch SFU config: ", e);
        setState({ kind: "failed", error: e as Error });
      }
    })();
  }, [client, livekitServiceURL, roomName]);

  switch (state.kind) {
    case "loading":
      return <LoadingView />;
    case "failed":
      return <ErrorView error={state.error} />;
    case "loaded":
      return (
        <SFUConfigContext.Provider value={state.sfuConfig}>
          {children}
        </SFUConfigContext.Provider>
      );
  }
}

type SFUConfigLoading = {
  kind: "loading";
};

type SFUConfigLoaded = {
  kind: "loaded";
  sfuConfig: SFUConfig;
};

type SFUConfigFailed = {
  kind: "failed";
  error: Error;
};
