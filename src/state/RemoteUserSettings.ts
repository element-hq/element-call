import { Setting } from "../settings/settings";

export interface RemoteUserSettingData {
  volume: number;
  cropVideo: boolean;
}

/**
 * A set of local modifications for a remote user's media that should persist
 * across calls.
 */
export class RemoteUserSetting extends Setting<RemoteUserSettingData> {
  constructor(userId: string) {
    super(`remoteusersettings-${userId}`, { volume: 1, cropVideo: true });
  }

  public set volume(volume: number) {
    this.setValue({
      ...this.getValue(),
      volume,
    });
  }

  public set cropVideo(cropVideo: boolean) {
    this.setValue({
      ...this.getValue(),
      cropVideo,
    });
  }
}
