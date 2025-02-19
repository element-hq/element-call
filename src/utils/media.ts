/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * Finds a media device with label matching 'deviceName'
 * @param deviceName The label of the device to look for
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
