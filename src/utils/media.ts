/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Finds a media device with label matching 'deviceName'
 * @param deviceName The label of the device to look for
 * @param kind The kind of media device to look for
 * @param devices The list of devices to search
 * @returns A matching media device or undefined if no matching device was found
 */
export function findDeviceByName(
  deviceName: string,
  kind: MediaDeviceKind,
  devices: MediaDeviceInfo[],
): string | undefined {
  const deviceInfo = devices.find(
    (d) => d.kind === kind && d.label === deviceName,
  );
  return deviceInfo?.deviceId;
}

/**
 * Whether one's own camera is shown mirrored: unless it faces away. A camera
 * that doesn't say which way it faces, as the built-in one on a Mac, is taken
 * to face the user.
 */
export function mirrors(
  facingMode: "user" | "environment" | undefined,
): boolean {
  return facingMode !== "environment";
}
