/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { type MatrixClient } from "matrix-js-sdk";

import { ClientProvider } from "./ClientContext";
import { DisconnectedBanner } from "./DisconnectedBanner";
import { hostClientSession } from "./state/ClientSession";

test("shows while the client's sync fails to connect", () => {
  const client = {
    on: vi.fn(),
    removeListener: vi.fn(),
    getUserId: () => "@alice:example.org",
  } as Partial<MatrixClient> as MatrixClient;
  const { container } = render(
    <ClientProvider session={hostClientSession(client)}>
      <DisconnectedBanner />
    </ClientProvider>,
  );
  expect(container.textContent).toBe("");

  const [, onSync] = vi.mocked(client.on).mock.calls[0] as [
    unknown,
    (state: string, old: null, data?: { error?: Error }) => void,
  ];
  const connectionError = Object.assign(new Error("offline"), {
    name: "ConnectionError",
  });
  act(() => onSync("ERROR", null, { error: connectionError }));
  expect(container.textContent).not.toBe("");
  // Any other failure is not a connection problem
  act(() => onSync("ERROR", null, { error: new Error("rate limited") }));
  expect(container.textContent).toBe("");
  act(() => onSync("SYNCING", null));
  expect(container.textContent).toBe("");
});
