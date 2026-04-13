/*
Copyright 2022-2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

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
  OverflowHorizontalIcon,
  OverflowVerticalIcon,
  VolumeOnSolidIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./Button.module.css";
import inCallFooterStyles from "../components/InCallFooter.module.css";
import { platform } from "../Platform";

interface MicButtonProps extends ComponentPropsWithoutRef<"button"> {
  enabled: boolean;
  size?: "sm" | "lg";
}

export const MicButton: FC<MicButtonProps> = ({ enabled, ...props }) => {
  const { t } = useTranslation();
  const Icon = enabled ? MicOnSolidIcon : MicOffSolidIcon;
  const label = enabled
    ? t("mute_microphone_button_label")
    : t("unmute_microphone_button_label");

  return (
    <Tooltip label={label}>
      <CpdButton
        iconOnly
        Icon={Icon}
        kind={enabled ? "primary" : "secondary"}
        role="switch"
        aria-checked={enabled}
        {...props}
      />
    </Tooltip>
  );
};

interface VideoButtonProps extends ComponentPropsWithoutRef<"button"> {
  enabled: boolean;
  size?: "sm" | "lg";
}

export const VideoButton: FC<VideoButtonProps> = ({ enabled, ...props }) => {
  const { t } = useTranslation();
  const Icon = enabled ? VideoCallSolidIcon : VideoCallOffSolidIcon;
  const label = enabled
    ? t("stop_video_button_label")
    : t("start_video_button_label");

  return (
    <Tooltip label={label}>
      <CpdButton
        iconOnly
        Icon={Icon}
        kind={enabled ? "primary" : "secondary"}
        role="switch"
        aria-checked={enabled}
        {...props}
      />
    </Tooltip>
  );
};

interface ShareScreenButtonProps extends ComponentPropsWithoutRef<"button"> {
  enabled: boolean;
  size: "sm" | "lg";
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
        role="switch"
        aria-checked={enabled}
        {...props}
      />
    </Tooltip>
  );
};

interface EndCallButtonProps extends ComponentPropsWithoutRef<"button"> {
  size?: "sm" | "lg";
}

export const EndCallButton: FC<EndCallButtonProps> = ({
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

interface LoudspeakerButtonProps extends ComponentPropsWithoutRef<"button"> {
  size?: "sm" | "lg";
  /** The button will be rendered:
   * true: currently in loudspeaker mode, pressing will switch to earpiece (rendered as enabled)
   * false: currently in earpiece mode, pressing will switch to loudspeaker (rendered as disabled)
   */
  isEarpieceTarget: boolean;
}

export const LoudspeakerButton: FC<LoudspeakerButtonProps> = (props) => {
  const { t } = useTranslation();
  const label = props.isEarpieceTarget
    ? t("settings.devices.handset")
    : t("settings.devices.loudspeaker");
  // if the target is the earpice, we are currently in loudspeaker mode.
  const enabled = props.isEarpieceTarget;
  return (
    <Tooltip label={label}>
      <CpdButton
        iconOnly
        Icon={VolumeOnSolidIcon}
        {...props}
        kind={enabled ? "primary" : "secondary"}
        role="switch"
        aria-checked={enabled}
      />
    </Tooltip>
  );
};

interface SettingsButtonProps extends ComponentPropsWithoutRef<"button"> {
  size?: "sm" | "lg";
  /** If the button should be styled so it fits into the footer center buttons group */
  forButtonsBar?: boolean;
  /** If this buttons should be setup to be used in the app bar */
  showForScreenWidth?: "wide" | "narrow";
}
export const SettingsButton: FC<SettingsButtonProps> = ({
  showForScreenWidth,
  forButtonsBar,
  className,
  ...props
}) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("common.settings")}>
      <CpdButton
        className={classNames(className, {
          [inCallFooterStyles.settingsOnlyShowWide]:
            showForScreenWidth === "wide",
          [inCallFooterStyles.settingsOnlyShowNarrow]:
            showForScreenWidth === "narrow",
        })}
        iconOnly
        Icon={
          platform === "android" ? OverflowVerticalIcon : OverflowHorizontalIcon
        }
        kind={forButtonsBar ? "secondary" : "tertiary"}
        {...props}
      />
    </Tooltip>
  );
};
