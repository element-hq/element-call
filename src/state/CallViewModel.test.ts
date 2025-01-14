/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { test, vi, onTestFinished, it } from "vitest";
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  skip,
  switchMap,
} from "rxjs";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import {
  ConnectionState,
  type LocalParticipant,
  type Participant,
  ParticipantEvent,
  type RemoteParticipant,
} from "livekit-client";
import * as ComponentsCore from "@livekit/components-core";
import { isEqual } from "lodash-es";
import {
  type CallMembership,
  type MatrixRTCSession,
} from "matrix-js-sdk/src/matrixrtc";

import { CallViewModel, type Layout } from "./CallViewModel";
import {
  mockLivekitRoom,
  mockLocalParticipant,
  mockMatrixRoom,
  mockMatrixRoomMember,
  mockRemoteParticipant,
  withTestScheduler,
  mockRtcMembership,
  MockRTCSession,
} from "../utils/test";
import {
  ECAddonConnectionState,
  type ECConnectionState,
} from "../livekit/useECConnectionState";
import { E2eeType } from "../e2ee/e2eeType";
import type { RaisedHandInfo } from "../reactions";
import { showNonMemberTiles } from "../settings/settings";
import {
  alice,
  aliceDoppelganger,
  aliceDoppelgangerId,
  aliceDoppelgangerRtcMember,
  aliceId,
  aliceParticipant,
  aliceRtcMember,
  bob,
  bobId,
  bobRtcMember,
  bobZeroWidthSpace,
  bobZeroWidthSpaceId,
  bobZeroWidthSpaceRtcMember,
  daveRTL,
  daveRTLId,
  daveRTLRtcMember,
  local,
  localId,
  localRtcMember,
} from "../utils/test-fixtures";

vi.mock("@livekit/components-core");

const daveRtcMember = mockRtcMembership("@dave:example.org", "DDDD");

const carol = local;
const carolId = localId;
const dave = mockMatrixRoomMember(daveRtcMember, { rawDisplayName: "Dave" });

const daveId = `${dave.userId}:${daveRtcMember.deviceId}`;

const localParticipant = mockLocalParticipant({ identity: "" });
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

const roomMembers = new Map(
  [alice, aliceDoppelganger, bob, bobZeroWidthSpace, carol, dave, daveRTL].map(
    (p) => [p.userId, p],
  ),
);

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

function summarizeLayout$(l$: Observable<Layout>): Observable<LayoutSummary> {
  return l$.pipe(
    switchMap((l) => {
      switch (l.type) {
        case "grid":
          return combineLatest(
            [
              l.spotlight?.media$ ?? of(undefined),
              ...l.grid.map((vm) => vm.media$),
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
            [l.spotlight.media$, ...l.grid.map((vm) => vm.media$)],
            (spotlight, ...grid) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              grid: grid.map((vm) => vm.id),
            }),
          );
        case "spotlight-expanded":
          return combineLatest(
            [l.spotlight.media$, l.pip?.media$ ?? of(undefined)],
            (spotlight, pip) => ({
              type: l.type,
              spotlight: spotlight.map((vm) => vm.id),
              pip: pip?.id,
            }),
          );
        case "one-on-one":
          return combineLatest(
            [l.local.media$, l.remote.media$],
            (local, remote) => ({
              type: l.type,
              local: local.id,
              remote: remote.id,
            }),
          );
        case "pip":
          return l.spotlight.media$.pipe(
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
  remoteParticipants$: Observable<RemoteParticipant[]>,
  rtcMembers$: Observable<Partial<CallMembership>[]>,
  connectionState$: Observable<ECConnectionState>,
  speaking: Map<Participant, Observable<boolean>>,
  continuation: (
    vm: CallViewModel,
    subjects: { raisedHands$: BehaviorSubject<Record<string, RaisedHandInfo>> },
  ) => void,
): void {
  const room = mockMatrixRoom({
    client: {
      getUserId: () => localRtcMember.sender,
      getDeviceId: () => localRtcMember.deviceId,
    } as Partial<MatrixClient> as MatrixClient,
    getMember: (userId) => roomMembers.get(userId) ?? null,
  });
  const rtcSession = new MockRTCSession(
    room,
    localRtcMember,
    [],
  ).withMemberships(rtcMembers$);
  const participantsSpy = vi
    .spyOn(ComponentsCore, "connectedParticipantsObserver")
    .mockReturnValue(remoteParticipants$);
  const mediaSpy = vi
    .spyOn(ComponentsCore, "observeParticipantMedia")
    .mockImplementation((p) =>
      of({ participant: p } as Partial<
        ComponentsCore.ParticipantMedia<LocalParticipant>
      > as ComponentsCore.ParticipantMedia<LocalParticipant>),
    );
  const eventsSpy = vi
    .spyOn(ComponentsCore, "observeParticipantEvents")
    .mockImplementation((p, ...eventTypes) => {
      if (eventTypes.includes(ParticipantEvent.IsSpeakingChanged)) {
        return (speaking.get(p) ?? of(false)).pipe(
          map((s) => ({ ...p, isSpeaking: s }) as Participant),
        );
      } else {
        return of(p);
      }
    });

  const roomEventSelectorSpy = vi
    .spyOn(ComponentsCore, "roomEventSelector")
    .mockImplementation((room, eventType) => of());

  const liveKitRoom = mockLivekitRoom(
    { localParticipant },
    { remoteParticipants$ },
  );

  const raisedHands$ = new BehaviorSubject<Record<string, RaisedHandInfo>>({});

  const vm = new CallViewModel(
    rtcSession as unknown as MatrixRTCSession,
    liveKitRoom,
    {
      kind: E2eeType.PER_PARTICIPANT,
    },
    connectionState$,
    raisedHands$,
    new BehaviorSubject({}),
  );

  onTestFinished(() => {
    vm!.destroy();
    participantsSpy!.mockRestore();
    mediaSpy!.mockRestore();
    eventsSpy!.mockRestore();
    roomEventSelectorSpy!.mockRestore();
  });

  continuation(vm, { raisedHands$: raisedHands$ });
}

test("participants are retained during a focus switch", () => {
  withTestScheduler(({ hot, expectObservable }) => {
    // Participants disappear on frame 2 and come back on frame 3
    const participantInputMarbles = "a-ba";
    // Start switching focus on frame 1 and reconnect on frame 3
    const connectionInputMarbles = " cs-c";
    // The visible participants should remain the same throughout the switch
    const expectedLayoutMarbles = "  a";

    withCallViewModel(
      hot(participantInputMarbles, {
        a: [aliceParticipant, bobParticipant],
        b: [],
      }),
      of([aliceRtcMember, bobRtcMember]),
      hot(connectionInputMarbles, {
        c: ConnectionState.Connected,
        s: ECAddonConnectionState.ECSwitchingFocus,
      }),
      new Map(),
      (vm) => {
        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
          },
        );
      },
    );
  });
});

test("screen sharing activates spotlight layout", () => {
  withTestScheduler(({ hot, schedule, expectObservable }) => {
    // Start with no screen shares, then have Alice and Bob share their screens,
    // then return to no screen shares, then have just Alice share for a bit
    const participantInputMarbles = "    abcda-ba";
    // While there are no screen shares, switch to spotlight manually, and then
    // switch back to grid at the end
    const modeInputMarbles = "           -----s--g";
    // We should automatically enter spotlight for the first round of screen
    // sharing, then return to grid, then manually go into spotlight, and
    // remain in spotlight until we manually go back to grid
    const expectedLayoutMarbles = "      abcdaefeg";
    const expectedShowSpeakingMarbles = "y----nyny";
    withCallViewModel(
      hot(participantInputMarbles, {
        a: [aliceParticipant, bobParticipant],
        b: [aliceSharingScreen, bobParticipant],
        c: [aliceSharingScreen, bobSharingScreen],
        d: [aliceParticipant, bobSharingScreen],
      }),
      of([aliceRtcMember, bobRtcMember]),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        schedule(modeInputMarbles, {
          s: () => vm.setGridMode("spotlight"),
          g: () => vm.setGridMode("grid"),
        });

        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            b: {
              type: "spotlight-landscape",
              spotlight: [`${aliceId}:0:screen-share`],
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            c: {
              type: "spotlight-landscape",
              spotlight: [
                `${aliceId}:0:screen-share`,
                `${bobId}:0:screen-share`,
              ],
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            d: {
              type: "spotlight-landscape",
              spotlight: [`${bobId}:0:screen-share`],
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            e: {
              type: "spotlight-landscape",
              spotlight: [`${aliceId}:0`],
              grid: ["local:0", `${bobId}:0`],
            },
            f: {
              type: "spotlight-landscape",
              spotlight: [`${aliceId}:0:screen-share`],
              grid: ["local:0", `${bobId}:0`, `${aliceId}:0`],
            },
            g: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${bobId}:0`, `${aliceId}:0`],
            },
          },
        );
        expectObservable(vm.showSpeakingIndicators$).toBe(
          expectedShowSpeakingMarbles,
          {
            y: true,
            n: false,
          },
        );
      },
    );
  });
});

test("participants stay in the same order unless to appear/disappear", () => {
  withTestScheduler(({ hot, schedule, expectObservable }) => {
    const visibilityInputMarbles = "a";
    // First Bob speaks, then Dave, then Alice
    const aSpeakingInputMarbles = " n- 1998ms - 1999ms y";
    const bSpeakingInputMarbles = " ny 1998ms n 1999ms -";
    const dSpeakingInputMarbles = " n- 1998ms y 1999ms n";
    // Nothing should change when Bob speaks, because Bob is already on screen.
    // When Dave speaks he should switch with Alice because she's the one who
    // hasn't spoken at all. Then when Alice speaks, she should return to her
    // place at the top.
    const expectedLayoutMarbles = " a  1999ms b 1999ms a 57999ms c 1999ms a";

    withCallViewModel(
      of([aliceParticipant, bobParticipant, daveParticipant]),
      of([aliceRtcMember, bobRtcMember, daveRtcMember]),
      of(ConnectionState.Connected),
      new Map([
        [aliceParticipant, hot(aSpeakingInputMarbles, { y: true, n: false })],
        [bobParticipant, hot(bSpeakingInputMarbles, { y: true, n: false })],
        [daveParticipant, hot(dSpeakingInputMarbles, { y: true, n: false })],
      ]),
      (vm) => {
        schedule(visibilityInputMarbles, {
          a: () => {
            // We imagine that only three tiles (the first three) will be visible
            // on screen at a time
            vm.layout$.subscribe((layout) => {
              if (layout.type === "grid") layout.setVisibleTiles(3);
            });
          },
        });

        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`, `${daveId}:0`],
            },
            b: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${daveId}:0`, `${bobId}:0`, `${aliceId}:0`],
            },
            c: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${daveId}:0`, `${bobId}:0`],
            },
          },
        );
      },
    );
  });
});

test("participants adjust order when space becomes constrained", () => {
  withTestScheduler(({ hot, schedule, expectObservable }) => {
    // Start with all tiles on screen then shrink to 3
    const visibilityInputMarbles = "a-b";
    // Bob and Dave speak
    const bSpeakingInputMarbles = " ny";
    const dSpeakingInputMarbles = " ny";
    // Nothing should change when Bob or Dave initially speak, because they are
    // on screen. When the screen becomes smaller Alice should move off screen
    // to make way for the speakers (specifically, she should swap with Dave).
    const expectedLayoutMarbles = " a-b";

    withCallViewModel(
      of([aliceParticipant, bobParticipant, daveParticipant]),
      of([aliceRtcMember, bobRtcMember, daveRtcMember]),
      of(ConnectionState.Connected),
      new Map([
        [bobParticipant, hot(bSpeakingInputMarbles, { y: true, n: false })],
        [daveParticipant, hot(dSpeakingInputMarbles, { y: true, n: false })],
      ]),
      (vm) => {
        let setVisibleTiles: ((value: number) => void) | null = null;
        vm.layout$.subscribe((layout) => {
          if (layout.type === "grid") setVisibleTiles = layout.setVisibleTiles;
        });
        schedule(visibilityInputMarbles, {
          a: () => setVisibleTiles!(Infinity),
          b: () => setVisibleTiles!(3),
        });

        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`, `${daveId}:0`],
            },
            b: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${daveId}:0`, `${bobId}:0`, `${aliceId}:0`],
            },
          },
        );
      },
    );
  });
});

test("spotlight speakers swap places", () => {
  withTestScheduler(({ hot, schedule, expectObservable }) => {
    // Go immediately into spotlight mode for the test
    const modeInputMarbles = "     s";
    // First Bob speaks, then Dave, then Alice
    const aSpeakingInputMarbles = "n--y";
    const bSpeakingInputMarbles = "nyn";
    const dSpeakingInputMarbles = "n-yn";
    // Alice should start in the spotlight, then Bob, then Dave, then Alice
    // again. However, the positions of Dave and Bob in the grid should be
    // reversed by the end because they've been swapped in and out of the
    // spotlight.
    const expectedLayoutMarbles = "abcd";

    withCallViewModel(
      of([aliceParticipant, bobParticipant, daveParticipant]),
      of([aliceRtcMember, bobRtcMember, daveRtcMember]),
      of(ConnectionState.Connected),
      new Map([
        [aliceParticipant, hot(aSpeakingInputMarbles, { y: true, n: false })],
        [bobParticipant, hot(bSpeakingInputMarbles, { y: true, n: false })],
        [daveParticipant, hot(dSpeakingInputMarbles, { y: true, n: false })],
      ]),
      (vm) => {
        schedule(modeInputMarbles, { s: () => vm.setGridMode("spotlight") });

        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "spotlight-landscape",
              spotlight: [`${aliceId}:0`],
              grid: ["local:0", `${bobId}:0`, `${daveId}:0`],
            },
            b: {
              type: "spotlight-landscape",
              spotlight: [`${bobId}:0`],
              grid: ["local:0", `${aliceId}:0`, `${daveId}:0`],
            },
            c: {
              type: "spotlight-landscape",
              spotlight: [`${daveId}:0`],
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            d: {
              type: "spotlight-landscape",
              spotlight: [`${aliceId}:0`],
              grid: ["local:0", `${daveId}:0`, `${bobId}:0`],
            },
          },
        );
      },
    );
  });
});

test("layout enters picture-in-picture mode when requested", () => {
  withTestScheduler(({ schedule, expectObservable }) => {
    // Enable then disable picture-in-picture
    const pipControlInputMarbles = "-ed";
    // Should go into picture-in-picture layout then back to grid
    const expectedLayoutMarbles = " aba";

    withCallViewModel(
      of([aliceParticipant, bobParticipant]),
      of([aliceRtcMember, bobRtcMember]),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        schedule(pipControlInputMarbles, {
          e: () => window.controls.enablePip(),
          d: () => window.controls.disablePip(),
        });

        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            b: {
              type: "pip",
              spotlight: [`${aliceId}:0`],
            },
          },
        );
      },
    );
  });
});

test("spotlight remembers whether it's expanded", () => {
  withTestScheduler(({ schedule, expectObservable }) => {
    // Start in spotlight mode, then switch to grid and back to spotlight a
    // couple times
    const modeInputMarbles = "     s-gs-gs";
    // Expand and collapse the spotlight
    const expandInputMarbles = "   -a--a";
    // Spotlight should stay expanded during the first mode switch, and stay
    // collapsed during the second mode switch
    const expectedLayoutMarbles = "abcbada";

    withCallViewModel(
      of([aliceParticipant, bobParticipant]),
      of([aliceRtcMember, bobRtcMember]),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        schedule(modeInputMarbles, {
          s: () => vm.setGridMode("spotlight"),
          g: () => vm.setGridMode("grid"),
        });
        schedule(expandInputMarbles, {
          a: () => {
            let toggle: () => void;
            vm.toggleSpotlightExpanded$.subscribe((val) => (toggle = val!));
            toggle!();
          },
        });

        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "spotlight-landscape",
              spotlight: [`${aliceId}:0`],
              grid: ["local:0", `${bobId}:0`],
            },
            b: {
              type: "spotlight-expanded",
              spotlight: [`${aliceId}:0`],
              pip: "local:0",
            },
            c: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
            },
            d: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${bobId}:0`, `${aliceId}:0`],
            },
          },
        );
      },
    );
  });
});

test("participants must have a MatrixRTCSession to be visible", () => {
  withTestScheduler(({ hot, expectObservable }) => {
    // iterate through a number of combinations of participants and MatrixRTC memberships
    // Bob never has an MatrixRTC membership
    const scenarioInputMarbles = " abcdec";
    // Bob should never be visible
    const expectedLayoutMarbles = "a-bc-b";

    withCallViewModel(
      hot(scenarioInputMarbles, {
        a: [],
        b: [bobParticipant],
        c: [aliceParticipant, bobParticipant],
        d: [aliceParticipant, daveParticipant, bobParticipant],
        e: [aliceParticipant, daveParticipant, bobSharingScreen],
      }),
      hot(scenarioInputMarbles, {
        a: [],
        b: [],
        c: [aliceRtcMember],
        d: [aliceRtcMember, daveRtcMember],
        e: [aliceRtcMember, daveRtcMember],
      }),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        vm.setGridMode("grid");
        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0"],
            },
            b: {
              type: "one-on-one",
              local: "local:0",
              remote: `${aliceId}:0`,
            },
            c: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${daveId}:0`],
            },
          },
        );
      },
    );
  });
});

test("shows participants without MatrixRTCSession when enabled in settings", () => {
  try {
    // enable the setting:
    showNonMemberTiles.setValue(true);
    withTestScheduler(({ hot, expectObservable }) => {
      const scenarioInputMarbles = " abc";
      const expectedLayoutMarbles = "abc";

      withCallViewModel(
        hot(scenarioInputMarbles, {
          a: [],
          b: [aliceParticipant],
          c: [aliceParticipant, bobParticipant],
        }),
        of([]), // No one joins the MatrixRTC session
        of(ConnectionState.Connected),
        new Map(),
        (vm) => {
          vm.setGridMode("grid");
          expectObservable(summarizeLayout$(vm.layout$)).toBe(
            expectedLayoutMarbles,
            {
              a: {
                type: "grid",
                spotlight: undefined,
                grid: ["local:0"],
              },
              b: {
                type: "one-on-one",
                local: "local:0",
                remote: `${aliceId}:0`,
              },
              c: {
                type: "grid",
                spotlight: undefined,
                grid: ["local:0", `${aliceId}:0`, `${bobId}:0`],
              },
            },
          );
        },
      );
    });
  } finally {
    showNonMemberTiles.setValue(showNonMemberTiles.defaultValue);
  }
});

it("should show at least one tile per MatrixRTCSession", () => {
  withTestScheduler(({ hot, expectObservable }) => {
    // iterate through some combinations of MatrixRTC memberships
    const scenarioInputMarbles = " abcd";
    // There should always be one tile for each MatrixRTCSession
    const expectedLayoutMarbles = "abcd";

    withCallViewModel(
      of([]),
      hot(scenarioInputMarbles, {
        a: [],
        b: [aliceRtcMember],
        c: [aliceRtcMember, daveRtcMember],
        d: [daveRtcMember],
      }),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        vm.setGridMode("grid");
        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0"],
            },
            b: {
              type: "one-on-one",
              local: "local:0",
              remote: `${aliceId}:0`,
            },
            c: {
              type: "grid",
              spotlight: undefined,
              grid: ["local:0", `${aliceId}:0`, `${daveId}:0`],
            },
            d: {
              type: "one-on-one",
              local: "local:0",
              remote: `${daveId}:0`,
            },
          },
        );
      },
    );
  });
});

test("should disambiguate users with the same displayname", () => {
  withTestScheduler(({ hot, expectObservable }) => {
    const scenarioInputMarbles = "abcde";
    const expectedLayoutMarbles = "abcde";

    withCallViewModel(
      of([]),
      hot(scenarioInputMarbles, {
        a: [],
        b: [aliceRtcMember],
        c: [aliceRtcMember, aliceDoppelgangerRtcMember],
        d: [aliceRtcMember, aliceDoppelgangerRtcMember, bobRtcMember],
        e: [aliceDoppelgangerRtcMember, bobRtcMember],
      }),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        // Skip the null state.
        expectObservable(vm.memberDisplaynames$.pipe(skip(1))).toBe(
          expectedLayoutMarbles,
          {
            // Carol has no displayname - So userId is used.
            a: new Map([[carolId, carol.userId]]),
            b: new Map([
              [carolId, carol.userId],
              [aliceId, alice.rawDisplayName],
            ]),
            // The second alice joins.
            c: new Map([
              [carolId, carol.userId],
              [aliceId, "Alice (@alice:example.org)"],
              [aliceDoppelgangerId, "Alice (@alice2:example.org)"],
            ]),
            // Bob also joins
            d: new Map([
              [carolId, carol.userId],
              [aliceId, "Alice (@alice:example.org)"],
              [aliceDoppelgangerId, "Alice (@alice2:example.org)"],
              [bobId, bob.rawDisplayName],
            ]),
            // Alice leaves, and the displayname should reset.
            e: new Map([
              [carolId, carol.userId],
              [aliceDoppelgangerId, "Alice"],
              [bobId, bob.rawDisplayName],
            ]),
          },
        );
      },
    );
  });
});

test("should disambiguate users with invisible characters", () => {
  withTestScheduler(({ hot, expectObservable }) => {
    const scenarioInputMarbles = "ab";
    const expectedLayoutMarbles = "ab";

    withCallViewModel(
      of([]),
      hot(scenarioInputMarbles, {
        a: [],
        b: [bobRtcMember, bobZeroWidthSpaceRtcMember],
      }),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        // Skip the null state.
        expectObservable(vm.memberDisplaynames$.pipe(skip(1))).toBe(
          expectedLayoutMarbles,
          {
            // Carol has no displayname - So userId is used.
            a: new Map([[carolId, carol.userId]]),
            // Both Bobs join, and should handle zero width hacks.
            b: new Map([
              [carolId, carol.userId],
              [bobId, `Bob (${bob.userId})`],
              [bobZeroWidthSpaceId, `Bob (${bobZeroWidthSpace.userId})`],
            ]),
          },
        );
      },
    );
  });
});

test("should strip RTL characters from displayname", () => {
  withTestScheduler(({ hot, expectObservable }) => {
    const scenarioInputMarbles = "ab";
    const expectedLayoutMarbles = "ab";

    withCallViewModel(
      of([]),
      hot(scenarioInputMarbles, {
        a: [],
        b: [daveRtcMember, daveRTLRtcMember],
      }),
      of(ConnectionState.Connected),
      new Map(),
      (vm) => {
        // Skip the null state.
        expectObservable(vm.memberDisplaynames$.pipe(skip(1))).toBe(
          expectedLayoutMarbles,
          {
            // Carol has no displayname - So userId is used.
            a: new Map([[carolId, carol.userId]]),
            // Both Dave's join. Since after stripping
            b: new Map([
              [carolId, carol.userId],
              // Not disambiguated
              [daveId, "Dave"],
              // This one is, since it's using RTL.
              [daveRTLId, `evaD (${daveRTL.userId})`],
            ]),
          },
        );
      },
    );
  });
});

it("should rank raised hands above video feeds and below speakers and presenters", () => {
  withTestScheduler(({ schedule, expectObservable }) => {
    // There should always be one tile for each MatrixRTCSession
    const expectedLayoutMarbles = "ab";

    withCallViewModel(
      of([aliceParticipant, bobParticipant]),
      of([aliceRtcMember, bobRtcMember]),
      of(ConnectionState.Connected),
      new Map(),
      (vm, { raisedHands$ }) => {
        schedule("ab", {
          a: () => {
            // We imagine that only two tiles (the first two) will be visible on screen at a time
            vm.layout$.subscribe((layout) => {
              if (layout.type === "grid") {
                layout.setVisibleTiles(2);
              }
            });
          },
          b: () => {
            raisedHands$.next({
              [`${bobRtcMember.sender}:${bobRtcMember.deviceId}`]: {
                time: new Date(),
                reactionEventId: "",
                membershipEventId: "",
              },
            });
          },
        });
        expectObservable(summarizeLayout$(vm.layout$)).toBe(
          expectedLayoutMarbles,
          {
            a: {
              type: "grid",
              spotlight: undefined,
              grid: [
                "local:0",
                "@alice:example.org:AAAA:0",
                "@bob:example.org:BBBB:0",
              ],
            },
            b: {
              type: "grid",
              spotlight: undefined,
              grid: [
                "local:0",
                // Bob shifts up!
                "@bob:example.org:BBBB:0",
                "@alice:example.org:AAAA:0",
              ],
            },
          },
        );
      },
    );
  });
});
