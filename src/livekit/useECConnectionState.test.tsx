/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState } from "react";
import { describe, expect, test, vi, vitest } from "vitest";
import {
  ConnectionError,
  ConnectionErrorReason,
  type Room,
} from "livekit-client";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { defer, sleep } from "matrix-js-sdk/lib/utils";

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
      useECConnectionState("default", false, mockRoom, sfuConfig);
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

describe("Leaking connection prevention", () => {
  function createTestComponent(mockRoom: Room): FC {
    const TestComponent: FC = () => {
      const [sfuConfig, setSfuConfig] = useState<SFUConfig | undefined>(
        undefined,
      );
      const connect = useCallback(
        () => setSfuConfig({ url: "URL", jwt: "JWT token" }),
        [],
      );
      useECConnectionState("default", false, mockRoom, sfuConfig);
      return <button onClick={connect}>Connect</button>;
    };
    return TestComponent;
  }

  test("Should cancel pending connections when the component is unmounted", async () => {
    const connectCall = vi.fn();
    const pendingConnection = defer<void>();
    // let pendingDisconnection = defer<void>()
    const disconnectMock = vi.fn();

    const mockRoom = {
      on: () => {},
      off: () => {},
      once: () => {},
      connect: async () => {
        connectCall.call(undefined);
        return await pendingConnection.promise;
      },
      disconnect: disconnectMock,
      localParticipant: {
        getTrackPublication: () => {},
        createTracks: () => [],
      },
    } as unknown as Room;

    const TestComponent = createTestComponent(mockRoom);

    const { unmount } = render(<TestComponent />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(connectCall).toHaveBeenCalled();
    // unmount while the connection is pending
    unmount();

    // resolve the pending connection
    pendingConnection.resolve();

    await vitest.waitUntil(
      () => {
        return disconnectMock.mock.calls.length > 0;
      },
      {
        timeout: 1000,
        interval: 100,
      },
    );

    // There should be some cleaning up to avoid leaking an open connection
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  test("Should cancel about to open but not yet opened connection", async () => {
    const createTracksCall = vi.fn();
    const pendingCreateTrack = defer<void>();
    // let pendingDisconnection = defer<void>()
    const disconnectMock = vi.fn();
    const connectMock = vi.fn();

    const mockRoom = {
      on: () => {},
      off: () => {},
      once: () => {},
      connect: connectMock,
      disconnect: disconnectMock,
      localParticipant: {
        getTrackPublication: () => {},
        createTracks: async () => {
          createTracksCall.call(undefined);
          await pendingCreateTrack.promise;
          return [];
        },
      },
    } as unknown as Room;

    const TestComponent = createTestComponent(mockRoom);

    const { unmount } = render(<TestComponent />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(createTracksCall).toHaveBeenCalled();
    // unmount while createTracks is pending
    unmount();

    // resolve createTracks
    pendingCreateTrack.resolve();

    // Yield to the event loop to let the connection attempt finish
    await sleep(100);

    // The operation should have been aborted before even calling connect.
    expect(connectMock).not.toHaveBeenCalled();
  });
});
