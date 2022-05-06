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

import { randomString } from "matrix-js-sdk/src/randomstring";
import { useEffect, useCallback, useRef, useState } from "react";

const RECAPTCHA_SCRIPT_URL =
  "https://www.recaptcha.net/recaptcha/api.js?onload=mxOnRecaptchaLoaded&render=explicit";

export function useRecaptcha(sitekey) {
  const [recaptchaId] = useState(() => randomString(16));
  const promiseRef = useRef();

  useEffect(() => {
    if (!sitekey) {
      return;
    }

    const onRecaptchaLoaded = () => {
      if (!document.getElementById(recaptchaId)) {
        return;
      }

      window.grecaptcha.render(recaptchaId, {
        sitekey,
        size: "invisible",
        callback: (response) => {
          if (promiseRef.current) {
            promiseRef.current.resolve(response);
          }
        },
        "error-callback": (error) => {
          if (promiseRef.current) {
            promiseRef.current.reject(error);
          }
        },
      });
    };

    if (
      typeof window.grecaptcha !== "undefined" &&
      typeof window.grecaptcha.render === "function"
    ) {
      onRecaptchaLoaded();
    } else {
      window.mxOnRecaptchaLoaded = onRecaptchaLoaded;

      if (!document.querySelector(`script[src="${RECAPTCHA_SCRIPT_URL}"]`)) {
        const scriptTag = document.createElement("script");
        scriptTag.src = RECAPTCHA_SCRIPT_URL;
        scriptTag.async = true;
        document.body.appendChild(scriptTag);
      }
    }
  }, [recaptchaId, sitekey]);

  const execute = useCallback(() => {
    if (!sitekey) {
      return Promise.resolve(null);
    }

    if (!window.grecaptcha) {
      console.log("Recaptcha not loaded");
      return Promise.reject(new Error("Recaptcha not loaded"));
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver((mutationsList) => {
        for (const item of mutationsList) {
          if (item.target?.style?.visibility !== "visible") {
            reject(new Error("Recaptcha dismissed"));
            observer.disconnect();
            return;
          }
        }
      });

      promiseRef.current = {
        resolve: (value) => {
          resolve(value);
          observer.disconnect();
        },
        reject: (error) => {
          reject(error);
          observer.disconnect();
        },
      };

      window.grecaptcha.execute();

      const iframe = document.querySelector(
        'iframe[src*="recaptcha/api2/bframe"]'
      );

      if (iframe?.parentNode?.parentNode) {
        observer.observe(iframe?.parentNode?.parentNode, {
          attributes: true,
        });
      }
    });
  }, [recaptchaId, sitekey]);

  const reset = useCallback(() => {
    if (window.grecaptcha) {
      window.grecaptcha.reset();
    }
  }, [recaptchaId]);

  return { execute, reset, recaptchaId };
}
