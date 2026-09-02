/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";
import { type FC } from "react";

import { ClientProvider, useClientState } from "./ClientContext";

const mockClient = (userId = "@alice:example.org"): MatrixClient =>
  ({
    on: vi.fn(),
    removeListener: vi.fn(),
    getUserId: () => userId,
    getDeviceId: () => "AAAA",
    stopClient: vi.fn(),
  }) as Partial<MatrixClient> as MatrixClient;

/** Reports what the context says, so a test can assert on it. */
const ShowClientState: FC = () => {
  const state = useClientState();
  if (state === undefined) return <span>loading</span>;
  if (state.state === "error") return <span>error</span>;
  return (
    <span>{state.authenticated?.client.getUserId() ?? "unauthenticated"}</span>
  );
};

test("uses a client supplied by the host without waiting", () => {
  const client = mockClient();

  const { container } = render(
    <BrowserRouter>
      <ClientProvider client={client}>
        <ShowClientState />
      </ClientProvider>
    </BrowserRouter>,
  );

  // Available on the very first render: a supplied client needs no session
  // restoring, so there is no loading state to pass through.
  expect(container.textContent).toBe("@alice:example.org");
});

test("does not claim exclusive use of storage when given a client", () => {
  // The channel is created when the module loads, so spy on the prototype
  // rather than trying to replace the global.
  const postMessage = vi.spyOn(BroadcastChannel.prototype, "postMessage");

  render(
    <BrowserRouter>
      <ClientProvider client={mockClient()}>
        <ShowClientState />
      </ClientProvider>
    </BrowserRouter>,
  );

  // The broadcast shuts down other instances to protect Element Call's own
  // stores. A host's client brings its own, so there is nothing to protect.
  expect(postMessage).not.toHaveBeenCalled();

  postMessage.mockRestore();
});

test("follows the client when the host swaps it", () => {
  const first = mockClient();
  const second = mockClient("@bob:example.org");

  const { container, rerender } = render(
    <BrowserRouter>
      <ClientProvider client={first}>
        <ShowClientState />
      </ClientProvider>
    </BrowserRouter>,
  );
  expect(container.textContent).toBe("@alice:example.org");

  // A host that re-authenticates hands us a new client on a mounted component
  rerender(
    <BrowserRouter>
      <ClientProvider client={second}>
        <ShowClientState />
      </ClientProvider>
    </BrowserRouter>,
  );

  expect(container.textContent).toBe("@bob:example.org");
});
