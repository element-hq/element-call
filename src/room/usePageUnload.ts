/*
Copyright 2022 New Vector Ltd

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

import { useEffect } from "react";

import { platform } from "../Platform";

export function usePageUnload(callback: () => void): void {
  useEffect(() => {
    let pageVisibilityTimeout: ReturnType<typeof setTimeout>;

    function onBeforeUnload(event: PageTransitionEvent): void {
      if (event.type === "visibilitychange") {
        if (document.visibilityState === "visible") {
          clearTimeout(pageVisibilityTimeout);
        } else {
          // Wait 5 seconds before closing the page to avoid accidentally leaving
          // TODO: Make this configurable?
          pageVisibilityTimeout = setTimeout(() => {
            callback();
          }, 5000);
        }
      } else {
        callback();
      }
    }

    // iOS doesn't fire beforeunload event, so leave the call when you hide the page.
    if (platform === "ios") {
      window.addEventListener("pagehide", onBeforeUnload);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      document.addEventListener("visibilitychange", onBeforeUnload);
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.addEventListener("beforeunload", onBeforeUnload);

    return (): void => {
      window.removeEventListener("pagehide", onBeforeUnload);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      document.removeEventListener("visibilitychange", onBeforeUnload);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(pageVisibilityTimeout);
    };
  }, [callback]);
}
