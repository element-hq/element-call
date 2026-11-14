/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * How a data track is named on LiveKit. Every data track of a member is one
 * LiveKit data track, which announces it; the prefix says how its payloads
 * travel. A lossy track pushes them as frames on the data track itself. A
 * reliable one sends each as a byte stream on a topic of the same name,
 * because LiveKit's data tracks are lossy only.
 */

const lossyPrefix = "lossy:";
const reliablePrefix = "reliable:";

export function toLivekitDataTrackName(
  name: string,
  reliable: boolean,
): string {
  return (reliable ? reliablePrefix : lossyPrefix) + name;
}

/** A track without a prefix, from a plain LiveKit publisher, is lossy under its own name. */
export function fromLivekitDataTrackName(livekitName: string): {
  name: string;
  reliable: boolean;
} {
  if (livekitName.startsWith(reliablePrefix))
    return { name: livekitName.slice(reliablePrefix.length), reliable: true };
  if (livekitName.startsWith(lossyPrefix))
    return { name: livekitName.slice(lossyPrefix.length), reliable: false };
  return { name: livekitName, reliable: false };
}
