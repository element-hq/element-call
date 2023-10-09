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

import { useMemo } from "react";
import { logger } from "matrix-js-sdk/src/logger";

import { E2EEConfig } from "./livekit/useLiveKit";

export const useE2eeConfig = (
  passwordString: string | null
): E2EEConfig | undefined => {
  return useMemo(() => {
    if (!passwordString) return undefined;

    // Since crypto.getRandomValues() gives UInt8Arrays, we get a 128 bit buffer and end up
    // base64 encoding it to get a text string. It's a bit silly to then pass this string to
    // Livekit when we could just pass the original random buffer, so we try to decode the
    // password and if it successfully decodes to a buffer of sufficient length, we use it
    // as such. Otherwise, we assume it's an old-style password and use it as a string.
    try {
      const itFunc = function* () {
        const decoded = atob(
          // built-in atob doesn't support base64url, so convert
          passwordString.replace("-", "+").replace("_", "/")
        );
        for (let i = 0; i < decoded.length; ++i) {
          yield decoded.charCodeAt(i);
        }
      };

      const pwBuf = Uint8Array.from(itFunc());
      if (pwBuf.length >= 16) {
        logger.info(
          "Detected base64 password of sufficient length: using as key buffer"
        );
        return { sharedKey: pwBuf };
      }
    } catch (e) {}

    logger.info("Old-style call password detected: using as string directly");
    return { sharedKey: passwordString };
  }, [passwordString]);
};
