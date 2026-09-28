/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type MediaViewModel } from "./media/MediaViewModel.ts";
import { type RingingMediaViewModel } from "./media/RingingMediaViewModel.ts";
import { type ScreenShareViewModel } from "./media/ScreenShareViewModel.ts";
import { type UserMediaViewModel } from "./media/UserMediaViewModel.ts";

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
