/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from "vitest";
import { act, render } from "@testing-library/react";
import { BehaviorSubject } from "rxjs";

import { DisconnectedBanner } from "./DisconnectedBanner";
import { DisconnectedProvider } from "./DisconnectedContext";

test("shows while the client is disconnected", () => {
  const disconnected$ = new BehaviorSubject(false);
  const { container } = render(
    <DisconnectedProvider value={disconnected$}>
      <DisconnectedBanner />
    </DisconnectedProvider>,
  );
  expect(container.textContent).toBe("");

  act(() => disconnected$.next(true));
  expect(container.textContent).not.toBe("");
  act(() => disconnected$.next(false));
  expect(container.textContent).toBe("");
});

test("stays hidden without a provider", () => {
  const { container } = render(<DisconnectedBanner />);
  expect(container.textContent).toBe("");
});
