/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";
import { type FC } from "react";
import { BehaviorSubject } from "rxjs";

import {
  ClientManagerProvider,
  ClientProvider,
  useClientManager,
  useClientManagerIfAny,
  useClientSessionState,
} from "./ClientContext";
import {
  type ClientManager,
  type ClientSession,
  type ClientSessionState,
  hostClientSession,
} from "./state/ClientSession";

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
  const state = useClientSessionState();
  switch (state.state) {
    case "signedIn":
      return <span>{state.client.getUserId()}</span>;
    case "signedOut":
      return <span>unauthenticated</span>;
    default:
      return <span>{state.state}</span>;
  }
};

const renderProvider = (
  session: ClientSession,
  children = <ShowClientState />,
): ReturnType<typeof render> =>
  render(
    <BrowserRouter>
      <ClientProvider session={session}>{children}</ClientProvider>
    </BrowserRouter>,
  );

test("uses a client supplied by the host without waiting", () => {
  const { container } = renderProvider(hostClientSession(mockClient()));

  // Available on the very first render: a supplied client needs no session
  // restoring, so there is no loading state to pass through.
  expect(container.textContent).toBe("@alice:example.org");
});

test("follows the client when the host swaps it", () => {
  const { container, rerender } = renderProvider(
    hostClientSession(mockClient()),
  );
  expect(container.textContent).toBe("@alice:example.org");

  // A host that re-authenticates hands us a new client on a mounted component
  rerender(
    <BrowserRouter>
      <ClientProvider
        session={hostClientSession(mockClient("@bob:example.org"))}
      >
        <ShowClientState />
      </ClientProvider>
    </BrowserRouter>,
  );

  expect(container.textContent).toBe("@bob:example.org");
});

test("follows a session of its own as it is restored", () => {
  const state$ = new BehaviorSubject<ClientSessionState>({ state: "loading" });
  const { container } = renderProvider({ state$ });

  // Nothing to show until a session has been restored or created
  expect(container.textContent).toBe("loading");
  act(() =>
    state$.next({
      state: "signedIn",
      client: mockClient(),
      passwordlessUser: true,
    }),
  );
  expect(container.textContent).toBe("@alice:example.org");
});

test("has no one signed in when the session says so", () => {
  const { container } = renderProvider({
    state$: new BehaviorSubject<ClientSessionState>({ state: "signedOut" }),
  });
  expect(container.textContent).toBe("unauthenticated");
});

test("shows the session's error in place of its children", () => {
  const { container } = renderProvider({
    state$: new BehaviorSubject<ClientSessionState>({
      state: "error",
      error: new Error("Opened elsewhere"),
    }),
  });
  // The error page, not the children
  expect(container.textContent).not.toContain("error");
  expect(container.textContent).toContain("Something went wrong");
});

test("hands the session's manager to views that need one", () => {
  const manager: ClientManager = {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };
  const { result } = renderHook(
    () => [useClientManager(), useClientManagerIfAny()],
    {
      wrapper: ({ children }) => (
        <ClientManagerProvider value={manager}>
          <>{children}</>
        </ClientManagerProvider>
      ),
    },
  );
  expect(result.current).toEqual([manager, manager]);
});

test("has no manager for a host's session", () => {
  // The component and the widget provide none; a view that insists on one is
  // in the wrong build
  expect(renderHook(() => useClientManagerIfAny()).result.current).toBeNull();
  expect(() => renderHook(() => useClientManager())).toThrow();
});
