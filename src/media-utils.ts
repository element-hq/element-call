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

import { logger } from "matrix-js-sdk/src/logger";

/**
 * Finds a media device with label matching 'deviceName'
 * @param deviceName The label of the device to look for
 * @param devices The list of devices to search
 * @returns A matching media device or undefined if no matching device was found
 */
export async function findDeviceByName(
  deviceName: string,
  kind: MediaDeviceKind,
  devices: MediaDeviceInfo[]
): Promise<string | undefined> {
  const deviceInfo = devices.find(
    (d) => d.kind === kind && d.label === deviceName
  );
  return deviceInfo?.deviceId;
}

/**
 * Gets the available audio input/output and video input devices
 * from the browser: a wrapper around mediaDevices.enumerateDevices()
 * that requests a stream and holds it while calling enumerateDevices().
 * This is because some browsers (Firefox) only return device labels when
 * the app has an active user media stream. In Chrome, this will get a
 * stream from the default camera which can mean, for example, that the
 * light for the FaceTime camera turns on briefly even if you selected
 * another camera. Once the Permissions API
 * (https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API)
 * is ready for primetime, this should allow us to avoid this.
 *
 * @return The available media devices
 */
export async function getNamedDevices(): Promise<MediaDeviceInfo[]> {
  // First get the devices without their labels, to learn what kinds of streams
  // we can request
  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    logger.warn("Unable to refresh WebRTC devices", error);
    devices = [];
  }

  let stream: MediaStream | null = null;
  try {
    if (devices.some((d) => d.kind === "audioinput")) {
      // Holding just an audio stream will be enough to get us all device labels
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } else if (devices.some((d) => d.kind === "videoinput")) {
      // We have to resort to a video stream
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }
  } catch (e) {
    logger.info("Couldn't get media stream for enumerateDevices: failing");
    throw e;
  }

  if (stream !== null) {
    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch (error) {
      logger.warn("Unable to refresh WebRTC devices", error);
    } finally {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }

  // If all else failed, continue without device labels
  return devices;
}
