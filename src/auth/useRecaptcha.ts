/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useCallback, useRef, useState } from "react";
import { secureRandomString } from "matrix-js-sdk/lib/randomstring";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";

import { translatedError } from "../TranslatedError";
declare global {
  interface Window {
    mxOnRecaptchaLoaded: () => void;
  }
}

const RECAPTCHA_SCRIPT_URL =
  "https://www.recaptcha.net/recaptcha/api.js?onload=mxOnRecaptchaLoaded&render=explicit";

interface RecaptchaPromiseRef {
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

export function useRecaptcha(sitekey?: string): {
  execute: () => Promise<string>;
  reset: () => void;
  recaptchaId: string;
} {
  const { t } = useTranslation();
  const [recaptchaId] = useState(() => secureRandomString(16));
  const promiseRef = useRef<RecaptchaPromiseRef | undefined>(undefined);

  useEffect(() => {
    if (!sitekey) return;

    const onRecaptchaLoaded = (): void => {
      if (!document.getElementById(recaptchaId)) return;

      window.grecaptcha.render(recaptchaId, {
        sitekey,
        size: "invisible",
        callback: (response: string) => promiseRef.current?.resolve(response),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "error-callback": () => promiseRef.current?.reject(new Error()),
      });
    };

    if (typeof window.grecaptcha?.render === "function") {
      onRecaptchaLoaded();
    } else {
      window.mxOnRecaptchaLoaded = onRecaptchaLoaded;

      if (!document.querySelector(`script[src="${RECAPTCHA_SCRIPT_URL}"]`)) {
        const scriptTag = document.createElement("script") as HTMLScriptElement;
        scriptTag.src = RECAPTCHA_SCRIPT_URL;
        scriptTag.async = true;
        document.body.appendChild(scriptTag);
      }
    }
  }, [recaptchaId, sitekey]);

  const execute = useCallback(async (): Promise<string> => {
    if (!sitekey) {
      return Promise.resolve("");
    }

    if (!window.grecaptcha) {
      logger.log("Recaptcha not loaded");
      return Promise.reject(translatedError("recaptcha_not_loaded", t));
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver((mutationsList) => {
        for (const item of mutationsList) {
          if ((item.target as HTMLElement)?.style?.visibility !== "visible") {
            reject(translatedError("recaptcha_dismissed", t));
            observer.disconnect();
            return;
          }
        }
      });

      promiseRef.current = {
        resolve: (value): void => {
          resolve(value);
          observer.disconnect();
        },
        reject: (error): void => {
          reject(error);
          observer.disconnect();
        },
      };

      window.grecaptcha.execute().then(
        () => {}, // noop
        (e) => {
          logger.error("Recaptcha execution failed", e);
        },
      );

      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[src*="recaptcha/api2/bframe"]',
      );

      if (iframe?.parentNode?.parentNode) {
        observer.observe(iframe?.parentNode?.parentNode, {
          attributes: true,
        });
      }
    });
  }, [sitekey, t]);

  const reset = useCallback(() => {
    window.grecaptcha?.reset();
  }, []);

  return { execute, reset, recaptchaId };
}
