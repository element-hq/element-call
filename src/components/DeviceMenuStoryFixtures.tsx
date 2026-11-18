/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useState, type FC, type ReactNode } from "react";

import { RootElementProvider } from "../RootElementContext";

/** Supplies a call-sized root. Without one the list is bounded by the whole Storybook frame. */
export const WithACallArea: FC<{ children: ReactNode; blockSize?: number }> = ({
  children,
  // A call's size: anything smaller makes a short device list scroll, and a
  // narrower one narrows the menu.
  blockSize = 720,
}) => {
  const [callArea, setCallArea] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setCallArea}
      style={{
        blockSize,
        inlineSize: 1024,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {callArea !== null && (
        <RootElementProvider value={callArea}>{children}</RootElementProvider>
      )}
    </div>
  );
};

/** Painted outline width, in px. */
export function outlineWidth(element: HTMLElement): number {
  const { outlineStyle, outlineWidth } = getComputedStyle(element);
  if (outlineStyle === "none") return 0;
  return Number.parseFloat(outlineWidth) || 0;
}
