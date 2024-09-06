/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { randomString } from "matrix-js-sdk/src/randomstring";

import { useClient } from "../ClientContext";
import { useInteractiveRegistration } from "../auth/useInteractiveRegistration";
import { generateRandomName } from "../auth/generateRandomName";
import { useRecaptcha } from "../auth/useRecaptcha";
import { widget } from "../widget";

interface UseRegisterPasswordlessUserType {
  privacyPolicyUrl?: string;
  registerPasswordlessUser: (displayName: string) => Promise<void>;
  recaptchaId?: string;
}

export function useRegisterPasswordlessUser(): UseRegisterPasswordlessUserType {
  const { setClient } = useClient();
  const { privacyPolicyUrl, recaptchaKey, register } =
    useInteractiveRegistration();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const registerPasswordlessUser = useCallback(
    async (displayName: string) => {
      if (!setClient) {
        throw new Error("No client context");
      }
      if (widget) {
        throw new Error(
          "Registration was skipped: We should never try to register password-less user in embedded mode.",
        );
      }

      try {
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const [client, session] = await register(
          userName,
          randomString(16),
          displayName,
          recaptchaResponse,
          true,
        );
        setClient({ client, session });
      } catch (e) {
        reset();
        throw e;
      }
    },
    [execute, reset, register, setClient],
  );

  return { privacyPolicyUrl, registerPasswordlessUser, recaptchaId };
}
