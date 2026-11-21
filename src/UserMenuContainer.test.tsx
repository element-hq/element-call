/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { type MatrixClient } from "matrix-js-sdk";
import { TooltipProvider } from "@vector-im/compound-web";
import { BehaviorSubject } from "rxjs";

import { ClientManagerProvider, ClientProvider } from "./ClientContext";
import { LeaveToHomeProvider } from "./LeaveToHomeContext";
import {
  type ClientManager,
  type ClientSession,
  type ClientSessionState,
  hostClientSession,
} from "./state/ClientSession";
import { UserMenuContainer } from "./UserMenuContainer";
import { flushPromises } from "./utils/test";

vi.mock("./settings/SettingsModal", () => ({
  defaultSettingsTab: "audio",
  SettingsModal: (): null => null,
}));

const mockClient = (): MatrixClient =>
  ({
    on: vi.fn(),
    removeListener: vi.fn(),
    getUserId: () => "@alice:example.org",
    getUserIdLocalpart: () => "alice",
    getDeviceId: () => "AAAA",
    getUser: () => null,
    stopClient: vi.fn(),
  }) as Partial<MatrixClient> as MatrixClient;

test("leaves for home after logging out of the session", async () => {
  const logout = vi.fn().mockResolvedValue(undefined);
  const leaveToHome = vi.fn();
  renderMenu(
    {
      state$: new BehaviorSubject<ClientSessionState>({
        state: "signedIn",
        client: mockClient(),
        passwordlessUser: false,
      }),
    },
    { login: vi.fn(), register: vi.fn(), logout },
    leaveToHome,
  );

  await selectSignOut();
  expect(logout).toHaveBeenCalled();
  expect(leaveToHome).toHaveBeenCalled();
});

test("cannot end a session that is not ours", async () => {
  const leaveToHome = vi.fn();
  renderMenu(hostClientSession(mockClient()), null, leaveToHome);

  await selectSignOut();
  expect(leaveToHome).not.toHaveBeenCalled();
});

async function selectSignOut(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByTestId("usermenu_open"));
  await user.click(await screen.findByTestId("usermenu_logout"));
  await flushPromises();
}

function renderMenu(
  session: ClientSession,
  manager: ClientManager | null,
  leaveToHome: (() => void) | null = null,
): void {
  render(
    <BrowserRouter>
      <TooltipProvider>
        <LeaveToHomeProvider value={leaveToHome}>
          <ClientProvider session={session}>
            <ClientManagerProvider value={manager}>
              <UserMenuContainer />
            </ClientManagerProvider>
          </ClientProvider>
        </LeaveToHomeProvider>
      </TooltipProvider>
    </BrowserRouter>,
  );
}
