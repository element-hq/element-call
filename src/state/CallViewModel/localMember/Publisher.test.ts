/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import { ConnectionState as LivekitConenctionState } from "livekit-client";
import { type BehaviorSubject } from "rxjs";
import { logger } from "matrix-js-sdk/lib/logger";

import { ObservableScope } from "../../ObservableScope";
import { constant } from "../../Behavior";
import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMediaDevices,
} from "../../../utils/test";
import { Publisher } from "./Publisher";
import { type Connection } from "../remoteMembers/Connection";
import { type MuteStates } from "../../MuteStates";

describe("Publisher", () => {
  let scope: ObservableScope;
  let connection: Connection;
  let muteStates: MuteStates;
  beforeEach(() => {
    muteStates = {
      audio: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
      video: {
        enabled$: constant(false),
        unsetHandler: vi.fn(),
        setHandler: vi.fn(),
      },
    } as unknown as MuteStates;
    scope = new ObservableScope();
    connection = {
      state$: constant(LivekitConenctionState.Connected),
      livekitRoom: mockLivekitRoom({
        localParticipant: mockLocalParticipant({}),
      }),
    } as unknown as Connection;
  });

  afterEach(() => scope.end());

  it("throws if livekit room could not publish", async () => {
    const publisher = new Publisher(
      scope,
      connection,
      mockMediaDevices({}),
      muteStates,
      constant({ supported: false, processor: undefined }),
      logger,
    );

    // should do nothing if no tracks have been created yet.
    await publisher.startPublishing();
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).not.toHaveBeenCalled();

    await expect(publisher.createAndSetupTracks()).rejects.toThrow(
      Error("audio and video is false"),
    );

    (muteStates.audio.enabled$ as BehaviorSubject<boolean>).next(true);

    (
      connection.livekitRoom.localParticipant.createTracks as Mock
    ).mockResolvedValue([{}, {}]);

    await expect(publisher.createAndSetupTracks()).resolves.not.toThrow();
    expect(
      connection.livekitRoom.localParticipant.createTracks,
    ).toHaveBeenCalledOnce();

    // failiour due to localParticipant.publishTrack
    (
      connection.livekitRoom.localParticipant.publishTrack as Mock
    ).mockRejectedValue(Error("testError"));

    await expect(publisher.startPublishing()).rejects.toThrow(
      new Error("testError"),
    );

    // does not try other conenction after the first one failed
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(1);

    // does not try other conenction after the first one failed
    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(1);

    // success case
    (
      connection.livekitRoom.localParticipant.publishTrack as Mock
    ).mockResolvedValue({});

    await expect(publisher.startPublishing()).resolves.not.toThrow();

    expect(
      connection.livekitRoom.localParticipant.publishTrack,
    ).toHaveBeenCalledTimes(3);
  });
});
