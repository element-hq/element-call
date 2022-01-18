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
          console.log("callback", response);
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
      console.log("no site key");
      return Promise.resolve(null);
    }

    if (!window.grecaptcha) {
      console.log("Recaptcha not loaded");
      return Promise.reject(new Error("Recaptcha not loaded"));
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver((mutationsList) => {
        for (const item of mutationsList) {
          if (item.target.style?.visibility !== "visible") {
            console.log("Recaptcha dismissed");
            reject(new Error("Recaptcha dismissed"));
            observer.disconnect();
            return;
          }
        }
      });

      promiseRef.current = {
        resolve: (value) => {
          console.log("Recaptcha resolved", value);
          resolve(value);
          observer.disconnect();
        },
        reject: (error) => {
          console.log("Recaptcha rejected", error);
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
      console.log("Recaptcha reset");
      window.grecaptcha.reset();
    }
  }, [recaptchaId]);

  return { execute, reset, recaptchaId };
}
