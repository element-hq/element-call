import { randomString } from "matrix-js-sdk/src/randomstring";
import { useEffect, useCallback, useRef, useState } from "react";

const RECAPTCHA_SCRIPT_URL =
  "https://www.recaptcha.net/recaptcha/api.js?onload=mxOnRecaptchaLoaded&render=explicit";

export function useRecaptcha(sitekey) {
  const [recaptchaId] = useState(() => randomString(16));
  const resolvePromiseRef = useRef();

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
          if (resolvePromiseRef.current) {
            resolvePromiseRef.current(response);
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
    if (!window.grecaptcha) {
      return Promise.reject(new Error("Recaptcha not loaded"));
    }

    return new Promise((resolve) => {
      resolvePromiseRef.current = resolve;
      window.grecaptcha.execute();
    });
  }, [recaptchaId]);

  const reset = useCallback(() => {
    if (window.grecaptcha) {
      window.grecaptcha.reset();
    }
  }, [recaptchaId]);

  console.log(recaptchaId);

  return { execute, reset, recaptchaId };
}
