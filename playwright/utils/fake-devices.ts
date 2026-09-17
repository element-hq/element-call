/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Page } from "@playwright/test";

/**
 * Gives the browser more fake devices than it ships with.
 *
 * A headless browser's fake capture offers one microphone and one speaker,
 * which is one short of what a device menu is for: with no choice to make, every
 * entry renders disabled. These are synthetic entries on top of the real fake
 * device, so the menu has a list to show and a selection to move, and the app
 * runs its real device pipeline against them.
 *
 * What they do not do is route audio: every entry is backed by the same capture,
 * and `setSinkId` is accepted rather than honoured. A test can prove that
 * choosing a device changes the app's state and does not disturb the call. That
 * a listener hears the change needs hardware, and stays a manual check.
 *
 * Must be called before the page navigates.
 */
export async function installFakeDevices(
  page: Page,
  { microphones = 2, speakers = 2 } = {},
): Promise<void> {
  await page.addInitScript(
    ({ microphones, speakers }) => {
      const synthetic = (
        kind: MediaDeviceKind,
        count: number,
        name: string,
      ): MediaDeviceInfo[] =>
        Array.from({ length: count }, (_, i) => {
          const info = {
            deviceId: `${kind}-${i + 1}`,
            groupId: `${kind}-group-${i + 1}`,
            kind,
            label: `${name} ${i + 1}`,
          };
          return { ...info, toJSON: () => info } as MediaDeviceInfo;
        });
      const ids = new Set(
        [
          ...synthetic("audioinput", microphones, ""),
          ...synthetic("audiooutput", speakers, ""),
        ].map((d) => d.deviceId),
      );

      const devices = navigator.mediaDevices;
      const enumerate = devices.enumerateDevices.bind(devices);
      devices.enumerateDevices = async (): Promise<MediaDeviceInfo[]> => [
        ...(await enumerate()),
        ...synthetic("audioinput", microphones, "Fake Microphone"),
        ...synthetic("audiooutput", speakers, "Fake Speaker"),
      ];

      // Our ids name no hardware, so an exact-device constraint on one would be
      // rejected. Drop it and let the one real fake device answer.
      const getUserMedia = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (
        constraints?: MediaStreamConstraints,
      ): Promise<MediaStream> => {
        const audio = constraints?.audio;
        if (typeof audio === "object") {
          const requested = audio.deviceId;
          const id =
            typeof requested === "object" && requested !== null
              ? ((requested as ConstrainDOMStringParameters).exact as string)
              : (requested as string | undefined);
          if (id !== undefined && ids.has(id))
            return getUserMedia({ ...constraints, audio: true });
        }
        return getUserMedia(constraints);
      };

      // Routing to a device that does not exist would reject, and the app
      // treats that as a failed switch. Both sinks are patched: Element Call
      // routes its own AudioContext as well as the media elements, and leaving
      // that one alone logs a NotFoundError for every switch.
      for (const proto of [
        HTMLMediaElement.prototype,
        AudioContext.prototype,
      ]) {
        const sink = proto as { setSinkId?: (id: string) => Promise<void> };
        const setSinkId = sink.setSinkId;
        if (setSinkId === undefined) continue;
        sink.setSinkId = async function (id: string): Promise<void> {
          if (!ids.has(id)) await setSinkId.call(this, id);
        };
      }
    },
    { microphones, speakers },
  );
}
