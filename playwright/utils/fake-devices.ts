/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Page } from "@playwright/test";

/**
 * Adds synthetic devices beside the browser's one fake microphone and speaker,
 * so the menu has a choice to show. They share one capture and `setSinkId` is
 * accepted but not honoured: routing still needs hardware and a manual check.
 * Call before the page navigates.
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

      // Our ids name no hardware, so drop the exact-device constraint.
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

      // Accept routing to our ids on both media elements and the AudioContext,
      // which the app also routes.
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
