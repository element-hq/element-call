/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

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
