/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback } from "react";
import { secureRandomString } from "matrix-js-sdk/lib/randomstring";

import { useClientSession } from "../ClientContext";
import { useRegistrationTerms } from "../auth/useRegistrationTerms";
import { generateRandomName } from "../auth/generateRandomName";
import { useRecaptcha } from "../auth/useRecaptcha";
import { useUrlParams } from "../UrlParams";

interface UseRegisterPasswordlessUserType {
  privacyPolicyUrl?: string;
  registerPasswordlessUser: (displayName: string) => Promise<void>;
  recaptchaId?: string;
}

export function useRegisterPasswordlessUser(): UseRegisterPasswordlessUserType {
  const { register } = useClientSession();
  const { isWidget } = useUrlParams();
  const { privacyPolicyUrl, recaptchaKey } = useRegistrationTerms();
  const { execute, reset, recaptchaId } = useRecaptcha(recaptchaKey);

  const registerPasswordlessUser = useCallback(
    async (displayName: string) => {
      if (!register) {
        throw new Error("This session cannot register");
      }
      if (isWidget) {
        throw new Error(
          "Registration was skipped: We should never try to register password-less user in embedded mode.",
        );
      }

      try {
        const recaptchaResponse = await execute();
        const userName = generateRandomName();
        const { setSignedIn } = await register(
          userName,
          secureRandomString(16),
          displayName,
          recaptchaResponse,
          true,
        );
        setSignedIn();
      } catch (e) {
        reset();
        throw e;
      }
    },
    [execute, reset, register, isWidget],
  );

  return { privacyPolicyUrl, registerPasswordlessUser, recaptchaId };
}
