/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";
import { createClient } from "matrix-js-sdk";

import { Config } from "../config/Config";
import { useUrlParams } from "../UrlParams";

/**
 * What the homeserver asks of a registration: its privacy policy to agree to
 * and the recaptcha key to answer a challenge with.
 */
export function useRegistrationTerms(): {
  privacyPolicyUrl?: string;
  recaptchaKey?: string;
} {
  const { isWidget } = useUrlParams();
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState<string | undefined>(
    undefined,
  );
  const [recaptchaKey, setRecaptchaKey] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (isWidget) return;
    // An empty registerRequest is used to get the privacy policy and recaptcha key.
    createClient({ baseUrl: Config.defaultHomeserverUrl()! })
      .registerRequest({})
      .catch((error) => {
        setPrivacyPolicyUrl(
          error.data?.params["m.login.terms"]?.policies?.privacy_policy?.en
            ?.url,
        );
        setRecaptchaKey(error.data?.params["m.login.recaptcha"]?.public_key);
      });
  }, [isWidget]);

  return { privacyPolicyUrl, recaptchaKey };
}
