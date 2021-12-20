import React, { useEffect, useRef } from "react";

export function RecaptchaInput({ publicKey, onResponse }) {
  const containerRef = useRef();
  const recaptchaRef = useRef();

  useEffect(() => {
    const onRecaptchaLoaded = () => {
      if (!recaptchaRef.current) {
        return;
      }

      window.grecaptcha.render(recaptchaRef.current, {
        sitekey: publicKey,
        callback: (response) => {
          if (!recaptchaRef.current) {
            return;
          }

          onResponse(response);
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
      const scriptTag = document.createElement("script");
      scriptTag.setAttribute(
        "src",
        `https://www.recaptcha.net/recaptcha/api.js?onload=mxOnRecaptchaLoaded&render=explicit`
      );
      containerRef.current.appendChild(scriptTag);
    }
  }, []);

  return (
    <div ref={containerRef}>
      <div ref={recaptchaRef} />
    </div>
  );
}
