import type TypedEmitter from "typed-emitter";

/* This file should become a part of LiveKit JS SDK. */

// Generic interface for all types that are capable of providing and managing media devices.
export interface MediaDevicesManager
  extends TypedEmitter<MediaDeviceHandlerCallbacks> {
  getDevices(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]>;
  setActiveDevice(kind: MediaDeviceKind, deviceId: string): Promise<void>;
}

export type MediaDeviceHandlerCallbacks = {
  devicesChanged: () => Promise<void>;
};

export enum MediaDeviceHandlerEvents {
  DevicesChanged = "devicesChanged",
}
