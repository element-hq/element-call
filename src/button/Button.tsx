/*
Copyright 2022-2024 New Vector Ltd

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
import { ComponentPropsWithoutRef, FC } from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { Button as CpdButton, Tooltip } from "@vector-im/compound-web";
import {
  MicOnSolidIcon,
  MicOffSolidIcon,
  VideoCallSolidIcon,
  VideoCallOffSolidIcon,
  EndCallIcon,
  ShareScreenSolidIcon,
  SettingsSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./Button.module.css";

interface MicButtonProps extends ComponentPropsWithoutRef<"button"> {
  muted: boolean;
}

export const MicButton: FC<MicButtonProps> = ({ muted, ...props }) => {
  const { t } = useTranslation();
  const Icon = muted ? MicOffSolidIcon : MicOnSolidIcon;
  const label = muted
    ? t("unmute_microphone_button_label")
    : t("mute_microphone_button_label");

  return (
    <Tooltip label={label}>
      <CpdButton
        iconOnly
        Icon={Icon}
        kind={muted ? "primary" : "secondary"}
        {...props}
      />
    </Tooltip>
  );
};

interface VideoButtonProps extends ComponentPropsWithoutRef<"button"> {
  muted: boolean;
}

export const VideoButton: FC<VideoButtonProps> = ({ muted, ...props }) => {
  const { t } = useTranslation();
  const Icon = muted ? VideoCallOffSolidIcon : VideoCallSolidIcon;
  const label = muted
    ? t("start_video_button_label")
    : t("stop_video_button_label");

  return (
    <Tooltip label={label}>
      <CpdButton
        iconOnly
        Icon={Icon}
        kind={muted ? "primary" : "secondary"}
        {...props}
      />
    </Tooltip>
  );
};

interface ShareScreenButtonProps extends ComponentPropsWithoutRef<"button"> {
  enabled: boolean;
}

export const ShareScreenButton: FC<ShareScreenButtonProps> = ({
  enabled,
  ...props
}) => {
  const { t } = useTranslation();
  const label = enabled
    ? t("stop_screenshare_button_label")
    : t("screenshare_button_label");

  return (
    <Tooltip label={label}>
      <CpdButton
        iconOnly
        Icon={ShareScreenSolidIcon}
        kind={enabled ? "primary" : "secondary"}
        {...props}
      />
    </Tooltip>
  );
};

export const EndCallButton: FC<ComponentPropsWithoutRef<"button">> = ({
  className,
  ...props
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("hangup_button_label")}>
      <CpdButton
        className={classNames(className, styles.endCall)}
        iconOnly
        Icon={EndCallIcon}
        destructive
        {...props}
      />
    </Tooltip>
  );
};

export const SettingsButton: FC<ComponentPropsWithoutRef<"button">> = (
  props,
) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("common.settings")}>
      <CpdButton
        iconOnly
        Icon={SettingsSolidIcon}
        kind="secondary"
        {...props}
      />
    </Tooltip>
  );
};
