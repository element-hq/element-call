/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * `CallView` over the mock drivers: no matrix-js-sdk client, the Rust crate
 * carrying the call. The lobby and the ended screen render as they would for
 * a host; the in-call screen needs a LiveKit SFU, which no mock provides yet,
 * so its story shows the path a call takes when the homeserver advertises no
 * transport instead.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { type FC, type ReactNode, useEffect, useMemo, useState } from "react";
import { BrowserRouter } from "react-router-dom";

import { CallView } from "./CallView";
import { CallEndedView } from "./CallEndedView";
import {
  type MatrixDrivers,
  MatrixDriverProvider,
} from "../driver/MatrixDriverContext";
import { MockElementCallMatrixClientDriver } from "../driver/MockElementCallMatrixClientDriver";
import {
  MockRtcMatrixDriver,
  type MockRtcMatrixDriverOptions,
  slotEvent,
} from "../driver/MockRtcMatrixDriver";
import { HostBridgeProvider, nullHostBridge } from "../HostBridge";
import { RootElementProvider } from "../RootElementContext";
import {
  componentProperties,
  configurationForIntent,
  type UrlParams,
  UrlParamsProvider,
  UserIntent,
} from "../UrlParams";
import { MediaDevicesContext } from "../MediaDevicesContext";
import { MediaDevices } from "../state/MediaDevices";
import { ObservableScope } from "../state/ObservableScope";
import { ProcessorProvider } from "../livekit/TrackProcessorContext";

const ROOM_ID = "!story:example.org";
const USER_ID = "@me:example.org";
const DEVICE_ID = "STORYDEV";

const alice = {
  userId: "@alice:example.org",
  deviceId: "ALICEDEV",
  memberId: "m-alice",
};

interface HostProps {
  intent: UserIntent;
  /** Members already in the call when the view mounts. */
  peers?: (typeof alice)[];
  /** The RTC driver's options, e.g. no transports for the error path. */
  rtc?: MockRtcMatrixDriverOptions;
  children: ReactNode;
}

/**
 * What a host provides around a call: the drivers, the host bridge, the
 * call's parameters, the media devices and the root element.
 */
const Host: FC<HostProps> = ({ intent, peers = [], rtc, children }) => {
  const drivers = useMemo((): MatrixDrivers => {
    const rtcDriver = new MockRtcMatrixDriver({
      userId: USER_ID,
      deviceId: DEVICE_ID,
      roomId: ROOM_ID,
      roomState: [slotEvent({ roomId: ROOM_ID, status: "open" })],
      ...rtc,
    });
    for (const peer of peers) rtcDriver.addPeer(peer);
    return {
      rtcDriver,
      clientDriver: new MockElementCallMatrixClientDriver({
        userId: USER_ID,
        deviceId: DEVICE_ID,
        roomId: ROOM_ID,
        roomInfo: { name: "Weekly sync", joinRule: "public" },
        ownProfile: { displayName: "Me", avatarUrl: null },
        members: [
          {
            userId: USER_ID,
            displayName: "Me",
            avatarUrl: null,
            membership: "join",
          },
          ...peers.map((p) => ({
            userId: p.userId,
            displayName: p.userId.slice(1).split(":")[0],
            avatarUrl: null,
            membership: "join" as const,
          })),
        ],
      }),
    };
  }, [peers, rtc]);
  const params = useMemo(
    (): UrlParams => ({
      ...componentProperties,
      roomId: ROOM_ID,
      ...configurationForIntent(intent),
    }),
    [intent],
  );
  // The peers join once the crate listens to the room: the participation is
  // created after the wasm has loaded, so poll for its sink.
  useEffect(() => {
    if (peers.length === 0) return;
    const rtcDriver = drivers.rtcDriver as MockRtcMatrixDriver;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      try {
        for (const peer of peers) rtcDriver.peerJoins(peer);
        clearInterval(timer);
      } catch {
        if (tries > 200) clearInterval(timer);
      }
    }, 50);
    return (): void => clearInterval(timer);
  }, [drivers, peers]);
  const [mediaDevices, setMediaDevices] = useState<MediaDevices | null>(null);
  useEffect(() => {
    const scope = new ObservableScope();
    setMediaDevices(new MediaDevices(scope, { controlledAudioDevices: false }));
    return (): void => {
      setMediaDevices(null);
      scope.end();
    };
  }, []);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <BrowserRouter>
      <HostBridgeProvider value={nullHostBridge}>
        <UrlParamsProvider value={params}>
          <MatrixDriverProvider value={drivers}>
            <div
              ref={setRoot}
              style={{ width: "80vw", height: "80vh", position: "relative" }}
            >
              {root !== null && mediaDevices !== null && (
                <RootElementProvider value={root}>
                  <MediaDevicesContext value={mediaDevices}>
                    <ProcessorProvider>
                      <>{children}</>
                    </ProcessorProvider>
                  </MediaDevicesContext>
                </RootElementProvider>
              )}
            </div>
          </MatrixDriverProvider>
        </UrlParamsProvider>
      </HostBridgeProvider>
    </BrowserRouter>
  );
};

const meta: Meta<typeof CallView> = {
  title: "Room/CallView",
  component: CallView,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof CallView>;

/** The lobby of a call that Alice is already in. */
export const Lobby: Story = {
  args: {
    isPasswordlessUser: false,
    confineToRoom: true,
    preload: false,
    skipLobby: false,
  },
  render: (args) => (
    <Host intent={UserIntent.JoinExistingCall} peers={[alice]}>
      <CallView {...args} />
    </Host>
  ),
};

/**
 * Straight into the call, with a homeserver that advertises no transport:
 * the crate fails the join and the view shows the error it turns into.
 */
export const NoTransport: Story = {
  args: {
    isPasswordlessUser: false,
    confineToRoom: true,
    preload: false,
    skipLobby: true,
  },
  render: (args) => (
    <Host intent={UserIntent.StartNewCall} rtc={{ transports: [] }}>
      <CallView {...args} />
    </Host>
  ),
};

/** The screen after leaving, as a passwordless user sees it. */
export const Ended: Story = {
  args: {
    isPasswordlessUser: true,
    confineToRoom: false,
    preload: false,
    skipLobby: false,
  },
  render: (args) => (
    <Host intent={UserIntent.JoinExistingCall}>
      <CallEndedView
        endedCallId={ROOM_ID}
        isPasswordlessUser={args.isPasswordlessUser}
        hideHeader={false}
        confineToRoom={args.confineToRoom}
      />
    </Host>
  ),
};
