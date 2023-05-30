export type MediaDevices = {
  available: MediaDeviceInfo[];
  selectedId: string;
};

export type MediaDevicesState = {
  state: Map<MediaDeviceKind, MediaDevices>;
  selectActiveDevice: (
    kind: MediaDeviceKind,
    deviceId: string
  ) => Promise<void>;
};
