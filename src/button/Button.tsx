/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/
import { type ComponentPropsWithoutRef, type FC } from "react";
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
