/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
