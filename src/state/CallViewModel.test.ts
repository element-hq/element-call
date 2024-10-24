/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { test, vi, onTestFinished } from "vitest";
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  Observable,
  of,
  switchMap,
} from "rxjs";
import { MatrixClient } from "matrix-js-sdk/src/matrix";
import {
  ConnectionState,
  LocalParticipant,
  Participant,
  RemoteParticipant,
} from "livekit-client";
import * as ComponentsCore from "@livekit/components-core";
import { isEqual } from "lodash";

import { CallViewModel, Layout } from "./CallViewModel";
import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMember,
  mockRemoteParticipant,
  withTestScheduler,
} from "../utils/test";
import {
  ECAddonConnectionState,
  ECConnectionState,
} from "../livekit/useECConnectionState";

vi.mock("@livekit/components-core");

const alice = mockMember({ userId: "@alice:example.org" });
const bob = mockMember({ userId: "@bob:example.org" });
const carol = mockMember({ userId: "@carol:example.org" });
const dave = mockMember({ userId: "@dave:example.org" });

const aliceId = `${alice.userId}:AAAA`;
const bobId = `${bob.userId}:BBBB`;
const daveId = `${dave.userId}:DDDD`;

const localParticipant = mockLocalParticipant({ identity: "" });
const aliceParticipant = mockRemoteParticipant({ identity: aliceId });
const aliceSharingScreen = mockRemoteParticipant({
  identity: aliceId,
  isScreenShareEnabled: true,
});
const bobParticipant = mockRemoteParticipant({ identity: bobId });
const bobSharingScreen = mockRemoteParticipant({
  identity: bobId,
  isScreenShareEnabled: true,
});
const daveParticipant = mockRemoteParticipant({ identity: daveId });

const members = new Map([alice, bob, carol, dave].map((p) => [p.userId, p]));

export interface GridLayoutSummary {
  type: "grid";
  spotlight?: string[];
  grid: string[];
}

export interface SpotlightLandscapeLayoutSummary {
  type: "spotlight-landscape";
  spotlight: string[];
  grid: string[];
}

export interface SpotlightPortraitLayoutSummary {
  type: "spotlight-portrait";
  spotlight: string[];
  grid: string[];
}

export interface SpotlightExpandedLayoutSummary {
  type: "spotlight-expanded";
  spotlight: string[];
  pip?: string;
}

export interface OneOnOneLayoutSummary {
  type: "one-on-one";
  local: string;
  remote: string;
}

export interface PipLayoutSummary {
  type: "pip";
  spotlight: string[];
}

export type LayoutSummary =
  | GridLayoutSummary
  | SpotlightLandscapeLayoutSummary
  | SpotlightPortraitLayoutSummary
  | SpotlightExpandedLayoutSummary
  | OneOnOneLayoutSummary
  | PipLayoutSummary;

function summarizeLayout(l: Observable<Layout>): Observable<LayoutSummary> {
  return l.pipe(
    switchMap((l) => {
      switch (l.type) {
        case "grid":
          return combineLatest(
            [
              l.spotlight?.media ?? of(undefined),
              ...l.grid.map((vm) => vm.media),
            ],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight?.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            }),
          );
        case "spotlight-landscape":
        case "spotlight-portrait":
          return combineLatest(
            [l.spotlight.media, ...l.grid.map((vm) => vm.media)],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            }),
          );
        case "spotlight-expanded":
          return combineLatest(
            [l.spotlight.media, l.pip?.media ?? of(undefined)],
            (spotlight, pip) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              pip: pip?.id,
            }),
          );
        case "one-on-one":
          return combineLatest(
            [l.local.media, l.remote.media],
            (local, remote) => ({
              type: l.type,
              local: local.id,
              remote: remote.id,
            }),
          );
        case "pip":
          return l.spotlight.media.pipe(
            map((spotlight) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
            })),
          );
      }
    }),
    // Sometimes there can be multiple (synchronous) updates per frame. We only
    // care about the most recent value for each time step, so discard these
    // extra values.
    debounceTime(0),
    distinctUntilChanged(isEqual),
  );
}

function withCallViewModel(
  remoteParticipants: Observable<RemoteParticipant[]>,
  connectionState: Observable<ECConnectionState>,
  speaking: Map<Participant, Observable<boolean>>,
  continuation: (vm: CallViewModel) => void,
): void {
  const participantsSpy = vi
    .spyOn(ComponentsCore, "connectedParticipantsObserver")
    .mockReturnValue(remoteParticipants);
  const mediaSpy = vi
    .spyOn(ComponentsCore, "observeParticipantMedia")
    .mockImplementation((p) =>
      of({ participant: p } as Partial<
        ComponentsCore.ParticipantMedia<LocalParticipant>
      > as ComponentsCore.ParticipantMedia<LocalParticipant>),
    );
  const eventsSpy = vi
    .spyOn(ComponentsCore, "observeParticipantEvents")
    .mockImplementation((p) =>
      (speaking.get(p) ?? of(false)).pipe(
        map((s) => ({ ...p, isSpeaking: s }) as Participant),
      ),
    );

  const vm = new CallViewModel(
    mockMatrixRoom({
      client: {
        getUserId: () => "@carol:example.org",
      } as Partial<MatrixClient> as MatrixClient,
      getMember: (userId) => members.get(userId) ?? null,
    }),
    mockLivekitRoom({ localParticipant }),
    true,
    connectionState,
  );

  onTestFinished(() => {
    vm!.destroy();
    participantsSpy!.mockRestore();
    mediaSpy!.mockRestore();
    eventsSpy!.mockRestore();
  });

  continuation(vm);
}

test("participants are retained during a focus switch", () => {
  withTestScheduler(({ cold, expectObservable }) => {
    // Participants disappear on frame 2 and come back on frame 3
    const partMarbles = "a-ba";
    // Start switching focus on frame 1 and reconnect on frame 3
    const connMarbles = "cs-c";
    // The visible participants should remain the same throughout the switch
    const laytMarbles = "a";

    withCallViewModel(
      cold(partMarbles, {
        a: [aliceParticipant, bobParticipant],
        b: [],
      }),
      cold(connMarbles, {
        c: ConnectionState.Connected,
        s: ECAddonConnectionState.ECSwitchingFocus,
      }),
      new Map(),
      (vm) => {
        expectObservable(summarizeLayout(vm.layout)).toBe(laytMarbles, {
          a: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
        });
      },
    );
  });
});

test("screen sharing activates spotlight layout", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    // Start with no screen shares, then have Alice and Bob share their screens,
    // then return to no screen shares, then have just Alice share for a bit
    const partMarbles = "abcda-ba";
    // While there are no screen shares, switch to spotlight manually, and then
    // switch back to grid at the end
    const modeMarbles = "-----s--g";
    // We should automatically enter spotlight for the first round of screen
    // sharing, then return to grid, then manually go into spotlight, and
    // remain in spotlight until we manually go back to grid
    const laytMarbles = "abcdaefeg";

    withCallViewModel(
      cold(partMarbles, {
        a: [aliceParticipant, bobParticipant],
        b: [aliceSharingScreen, bobParticipant],
        c: [aliceSharingScreen, bobSharingScreen],
        d: [aliceParticipant, bobSharingScreen],
      }),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        schedule(modeMarbles, {
          s: () => vm.setGridMode("spotlight"),
          g: () => vm.setGridMode("grid"),
        });

        expectObservable(summarizeLayout(vm.layout)).toBe(laytMarbles, {
          a: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          b: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0:screen-share`],
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          c: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0:screen-share`, `${bobId}:0:screen-share`],
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          d: {
            type: "spotlight-landscape",
            spotlight: [`${bobId}:0:screen-share`],
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          e: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0`],
            grid: [":0", `${bobId}:0`],
          },
          f: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0:screen-share`],
            grid: [":0", `${bobId}:0`, `${aliceId}:0`],
          },
          g: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${bobId}:0`, `${aliceId}:0`],
          },
        });
      },
    );
  });
});

test("participants stay in the same order unless to appear/disappear", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    const initMarbles = "a";
    // First Bob speaks, then Dave, then Alice
    const aSpkMarbles = "n- 1998ms - 1999ms y";
    const bSpkMarbles = "ny 1998ms n 1999ms ";
    const dSpkMarbles = "n- 1998ms y 1999ms n";
    // Nothing should change when Bob speaks, because Bob is already on screen.
    // When Dave speaks he should switch with Alice because she's the one who
    // hasn't spoken at all. Then when Alice speaks, she should return to her
    // place at the top.
    const laytMarbles = "a 1999ms b 1999ms a 57999ms c 1999ms a";

    withCallViewModel(
      of([aliceParticipant, bobParticipant, daveParticipant]),
      of(ConnectionState.Connected),
      new Map([
        [aliceParticipant, cold(aSpkMarbles, { y: true, n: false })],
        [bobParticipant, cold(bSpkMarbles, { y: true, n: false })],
        [daveParticipant, cold(dSpkMarbles, { y: true, n: false })],
      ]),
      (vm) => {
        schedule(initMarbles, {
          a: () => {
            // We imagine that only three tiles (the first three) will be visible
            // on screen at a time
            vm.layout.subscribe((layout) => {
              if (layout.type === "grid") {
                for (let i = 0; i < layout.grid.length; i++)
                  layout.grid[i].setVisible(i < 3);
              }
            });
          },
        });

        expectObservable(summarizeLayout(vm.layout)).toBe(laytMarbles, {
          a: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${aliceId}:0`, `${bobId}:0`, `${daveId}:0`],
          },
          b: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${daveId}:0`, `${bobId}:0`, `${aliceId}:0`],
          },
          c: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${aliceId}:0`, `${daveId}:0`, `${bobId}:0`],
          },
        });
      },
    );
  });
});

test("spotlight speakers swap places", () => {
  withTestScheduler(({ cold, schedule, expectObservable }) => {
    // Go immediately into spotlight mode for the test
    const initMarbles = "s";
    // First Bob speaks, then Dave, then Alice
    const aSpkMarbles = "n--y";
    const bSpkMarbles = "nyn";
    const dSpkMarbles = "n-yn";
    // Alice should start in the spotlight, then Bob, then Dave, then Alice
    // again. However, the positions of Dave and Bob in the grid should be
    // reversed by the end because they've been swapped in and out of the
    // spotlight.
    const laytMarbles = "abcd";

    withCallViewModel(
      of([aliceParticipant, bobParticipant, daveParticipant]),
      of(ConnectionState.Connected),
      new Map([
        [aliceParticipant, cold(aSpkMarbles, { y: true, n: false })],
        [bobParticipant, cold(bSpkMarbles, { y: true, n: false })],
        [daveParticipant, cold(dSpkMarbles, { y: true, n: false })],
      ]),
      (vm) => {
        schedule(initMarbles, { s: () => vm.setGridMode("spotlight") });

        expectObservable(summarizeLayout(vm.layout)).toBe(laytMarbles, {
          a: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0`],
            grid: [":0", `${bobId}:0`, `${daveId}:0`],
          },
          b: {
            type: "spotlight-landscape",
            spotlight: [`${bobId}:0`],
            grid: [":0", `${aliceId}:0`, `${daveId}:0`],
          },
          c: {
            type: "spotlight-landscape",
            spotlight: [`${daveId}:0`],
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          d: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0`],
            grid: [":0", `${daveId}:0`, `${bobId}:0`],
          },
        });
      },
    );
  });
});

test("layout enters picture-in-picture mode when requested", () => {
  withTestScheduler(({ schedule, expectObservable }) => {
    // Enable then disable picture-in-picture
    const pipCMarbles = "-ed";
    // Should go into picture-in-picture layout then back to grid
    const laytMarbles = "aba";

    withCallViewModel(
      of([aliceParticipant, bobParticipant]),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        schedule(pipCMarbles, {
          e: () => window.controls.enablePip(),
          d: () => window.controls.disablePip(),
        });

        expectObservable(summarizeLayout(vm.layout)).toBe(laytMarbles, {
          a: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          b: {
            type: "pip",
            spotlight: [`${aliceId}:0`],
          },
        });
      },
    );
  });
});

test("spotlight remembers whether it's expanded", () => {
  withTestScheduler(({ schedule, expectObservable }) => {
    // Start in spotlight mode, then switch to grid and back to spotlight a
    // couple times
    const modeMarbles = "s-gs-gs";
    // Expand and collapse the spotlight
    const expdMarbles = "-a--a";
    // Spotlight should stay expanded during the first mode switch, and stay
    // collapsed during the second mode switch
    const laytMarbles = "abcbada";

    withCallViewModel(
      of([aliceParticipant, bobParticipant]),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        schedule(modeMarbles, {
          s: () => vm.setGridMode("spotlight"),
          g: () => vm.setGridMode("grid"),
        });
        schedule(expdMarbles, {
          a: () => {
            let toggle: () => void;
            vm.toggleSpotlightExpanded.subscribe((val) => (toggle = val!));
            toggle!();
          },
        });

        expectObservable(summarizeLayout(vm.layout)).toBe(laytMarbles, {
          a: {
            type: "spotlight-landscape",
            spotlight: [`${aliceId}:0`],
            grid: [":0", `${bobId}:0`],
          },
          b: {
            type: "spotlight-expanded",
            spotlight: [`${aliceId}:0`],
            pip: ":0",
          },
          c: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${aliceId}:0`, `${bobId}:0`],
          },
          d: {
            type: "grid",
            spotlight: undefined,
            grid: [":0", `${bobId}:0`, `${aliceId}:0`],
          },
        });
      },
    );
  });
});
