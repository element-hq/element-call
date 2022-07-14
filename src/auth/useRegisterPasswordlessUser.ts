/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { useCallback } from "react";
import { randomString } from "matrix-js-sdk/src/randomstring";

import { useClient } from "../ClientContext";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { generateRandomName } from "../auth/generateRandomName";
import { useRecaptcha } from "../auth/useRecaptcha";

export interface UseRegisterPasswordlessUserType {
  privacyPolicyUrl: string;
  registerPasswordlessUser: (displayName: string) => Promise<void>;
  recaptchaId: string;
}

export function useRegisterPasswordlessUser(): UseRegisterPasswordlessUserType {
  const { setClient } = useClient();
  const [privacyPolicyUrl, recaptchaKey, register] =
    useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const registerPasswordlessUser = useCallback(
    async (displayName: string) => {
      try {
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const [client, session] = await register(
          userName,
          randomString(16),
          displayName,
          recaptchaResponse,
          true
        );
        setClient(client, session);
      } catch (e) {
        reset();
        throw e;
      }
    },
    [execute, reset, register, setClient]
  );

  return { privacyPolicyUrl, registerPasswordlessUser, recaptchaId };
}
