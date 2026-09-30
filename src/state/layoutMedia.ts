/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LayoutMode } from "./LayoutSwitchViewModel.ts";
import {
  type GridLayoutMedia,
  type LayoutMedia,
  type OneOnOneDesktopLayoutMedia,
  type OneOnOneMobileLayoutMedia,
  type SpotlightExpandedLayoutMedia,
  type SpotlightLandscapeLayoutMedia,
  type SpotlightPortraitLayoutMedia,
  type WindowMode,
} from "./layout-types.ts";
import { type LocalUserMediaViewModel } from "./media/LocalUserMediaViewModel.ts";
import { type MediaViewModel } from "./media/MediaViewModel.ts";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel.ts";
import { type ScreenShareViewModel } from "./media/ScreenShareViewModel.ts";
import { type UserMediaViewModel } from "./media/UserMediaViewModel.ts";

/**
 * This is the number of participants that we think constitutes a "small" call
 * on mobile. No spotlight tile should be shown below this threshold.
 */
const smallMobileCallThreshold = 3;

/**
 * Picks who to spotlight based on who is speaking, preferring the previous
 * pick so that the spotlight doesn't flip eagerly between speakers.
 *
 * @param prev The previous pick, if any.
 * @param items All user media in the call along with whether each is speaking.
 */
export function chooseSpotlightSpeaker<M extends { local: boolean }>(
  prev: M | undefined,
  items: readonly { media: M; speaking: boolean }[],
): M | undefined {
  // Only remote users that are still in the call should be sticky
  const sticky = items.find((i) => i.media === prev && !i.media.local);
  // If the previous speaker is still speaking, stick with them
  if (sticky?.speaking) return sticky.media;
  return (
    // Otherwise, select any remote user who is speaking
    items.find((i) => !i.media.local && i.speaking)?.media ??
    // Otherwise, stick with the person who was last speaking
    sticky?.media ??
    // Otherwise, spotlight an arbitrary remote user
    items.find((i) => !i.media.local)?.media ??
    // Otherwise, spotlight the local user
    items.find((i) => i.media.local)?.media
  );
}

export interface SpotlightInputs {
  ringing: RingingMediaViewModel | null;
  screenShares: ScreenShareViewModel[];
  speaker: UserMediaViewModel | undefined;
  /** Local user media suitable for showing in a PiP, if any. */
  localPip: UserMediaViewModel | undefined;
}

/**
 * Decides what goes in the spotlight, and what goes in the picture-in-picture
 * tile of the expanded spotlight layout.
 */
export function computeSpotlight({
  ringing,
  screenShares,
  speaker,
  localPip,
}: SpotlightInputs): {
  spotlight: MediaViewModel[];
  pip: UserMediaViewModel | undefined;
} {
  if (ringing !== null) return { spotlight: [ringing], pip: localPip };
  if (screenShares.length > 0) return { spotlight: screenShares, pip: speaker };
  return {
    spotlight: speaker ? [speaker] : [],
    // Hide PiP if redundant (i.e. if local user is already in spotlight)
    pip: localPip === speaker ? undefined : localPip,
  };
}

export interface OneOnOneMedia {
  local: LocalUserMediaViewModel;
  remote: UserMediaViewModel | RingingMediaViewModel;
}

export interface LayoutMediaInputs {
  windowMode: WindowMode;
  /** The layout chosen with the layout switch. */
  layoutMode: LayoutMode;
  spotlightExpanded: boolean;
  /** Set when the call qualifies for a one-on-one layout. */
  oneOnOne: OneOnOneMedia | null;
  localVideoEnabled: boolean;
  spotlight: MediaViewModel[];
  grid: UserMediaViewModel[];
  pip: UserMediaViewModel | undefined;
  desktop: boolean;
}

/**
 * Decides which layout to use and which media goes where in it.
 */
export function computeLayoutMedia({
  windowMode,
  layoutMode,
  spotlightExpanded,
  oneOnOne,
  localVideoEnabled,
  spotlight,
  grid,
  pip,
  desktop,
}: LayoutMediaInputs): LayoutMedia {
  switch (windowMode) {
    case "normal":
      if (layoutMode === "grid")
        return oneOnOne === null
          ? gridLayoutMedia(spotlight, grid)
          : oneOnOneDesktopLayoutMedia(oneOnOne);
      return spotlightExpanded
        ? spotlightExpandedLayoutMedia(false, spotlight, pip)
        : spotlightLandscapeLayoutMedia(false, spotlight, grid);
    case "narrow":
      if (oneOnOne !== null)
        return oneOnOneMobileLayoutMedia(oneOnOne, localVideoEnabled);
      return grid.length > smallMobileCallThreshold || hasScreenShare(spotlight)
        ? spotlightPortraitLayoutMedia(spotlight, grid)
        : gridLayoutMedia(spotlight, grid);
    case "flat":
      if (oneOnOne !== null)
        return oneOnOneMobileLayoutMedia(oneOnOne, localVideoEnabled);
      // Yes, grid mode actually gets you a "spotlight" layout in this window
      // mode.
      return layoutMode === "grid"
        ? spotlightLandscapeLayoutMedia(true, spotlight, grid)
        : spotlightExpandedLayoutMedia(true, spotlight, pip);
    case "pip":
      return { type: "pip", edgeToEdge: !desktop, spotlight };
  }
}

function hasScreenShare(spotlight: MediaViewModel[]): boolean {
  return spotlight.some((vm) => vm.type === "screen share");
}

function gridLayoutMedia(
  spotlight: MediaViewModel[],
  grid: UserMediaViewModel[],
): GridLayoutMedia {
  return {
    type: "grid",
    edgeToEdge: false,
    spotlight: hasScreenShare(spotlight) ? spotlight : undefined,
    grid,
  };
}

function oneOnOneDesktopLayoutMedia(
  media: OneOnOneMedia,
): OneOnOneDesktopLayoutMedia {
  return media.remote.type === "ringing"
    ? {
        type: "one-on-one-desktop",
        edgeToEdge: false,
        spotlight: media.local,
        pip: media.remote,
      }
    : {
        type: "one-on-one-desktop",
        edgeToEdge: false,
        spotlight: media.remote,
        pip: media.local,
      };
}

function spotlightExpandedLayoutMedia(
  edgeToEdge: boolean,
  spotlight: MediaViewModel[],
  pip: UserMediaViewModel | undefined,
): SpotlightExpandedLayoutMedia {
  return { type: "spotlight-expanded", edgeToEdge, spotlight, pip };
}

function spotlightLandscapeLayoutMedia(
  edgeToEdge: boolean,
  spotlight: MediaViewModel[],
  grid: UserMediaViewModel[],
): SpotlightLandscapeLayoutMedia {
  return { type: "spotlight-landscape", edgeToEdge, spotlight, grid };
}

function oneOnOneMobileLayoutMedia(
  media: OneOnOneMedia,
  localVideoEnabled: boolean,
): OneOnOneMobileLayoutMedia {
  return {
    type: "one-on-one-mobile",
    edgeToEdge: true,
    spotlight: media.remote,
    pip: localVideoEnabled ? media.local : undefined,
  };
}

function spotlightPortraitLayoutMedia(
  spotlight: MediaViewModel[],
  grid: UserMediaViewModel[],
): SpotlightPortraitLayoutMedia {
  return { type: "spotlight-portrait", edgeToEdge: false, spotlight, grid };
}
