/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState } from "react";
import { test, vi } from "vitest";
import {
  ConnectionError,
  ConnectionErrorReason,
  type Room,
} from "livekit-client";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { useECConnectionState } from "./useECConnectionState";
import { type SFUConfig } from "./openIDSFU";
import { GroupCallErrorBoundary } from "../room/GroupCallErrorBoundary.tsx";

test.each<[string, ConnectionError]>([
  [
    "LiveKit hits track limit",
    new ConnectionError("", ConnectionErrorReason.InternalError, 503),
  ],
  [
    "LiveKit hits room participant limit",
    new ConnectionError("", ConnectionErrorReason.ServerUnreachable, 200),
  ],
  [
    "LiveKit Cloud hits connection limit",
    new ConnectionError("", ConnectionErrorReason.NotAllowed, 429),
  ],
])(
  "useECConnectionState throws error when %s hits track limit",
  async (_server, error) => {
    const mockRoom = {
      on: () => {},
      off: () => {},
      once: () => {},
      connect: () => {
        throw error;
      },
      localParticipant: {
        getTrackPublication: () => {},
        createTracks: () => [],
      },
    } as unknown as Room;

    const TestComponent: FC = () => {
      const [sfuConfig, setSfuConfig] = useState<SFUConfig | undefined>(
        undefined,
      );
      const connect = useCallback(
        () => setSfuConfig({ url: "URL", jwt: "JWT token" }),
        [],
      );
      useECConnectionState({}, false, mockRoom, sfuConfig);
      return <button onClick={connect}>Connect</button>;
    };

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GroupCallErrorBoundary recoveryActionHandler={vi.fn()} widget={null}>
          <TestComponent />
        </GroupCallErrorBoundary>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));
    screen.getByText("Insufficient capacity");
  },
);
