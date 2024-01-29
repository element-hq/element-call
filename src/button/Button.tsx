/*
Copyright 2022 - 2023 New Vector Ltd

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
import { FC, forwardRef, useCallback, useEffect, useState } from "react";
import { PressEvent } from "@react-types/shared";
import classNames from "classnames";
import { useButton } from "@react-aria/button";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@vector-im/compound-web";
import { ChangeEvent } from "react";
import MicOnSolidIcon from "@vector-im/compound-design-tokens/icons/mic-on-solid.svg?react";
import MicOffSolidIcon from "@vector-im/compound-design-tokens/icons/mic-off-solid.svg?react";
import VideoCallSolidIcon from "@vector-im/compound-design-tokens/icons/video-call-solid.svg?react";
import VideoCallOffSolidIcon from "@vector-im/compound-design-tokens/icons/video-call-off-solid.svg?react";
import EndCallIcon from "@vector-im/compound-design-tokens/icons/end-call.svg?react";
import ShareScreenSolidIcon from "@vector-im/compound-design-tokens/icons/share-screen-solid.svg?react";
import SettingsSolidIcon from "@vector-im/compound-design-tokens/icons/settings-solid.svg?react";
import ChevronDownIcon from "@vector-im/compound-design-tokens/icons/chevron-down.svg?react";

import styles from "./Button.module.css";
import RemoveIcon from "../icons/Remove.svg?react";
import AddBreakoutRoomIcon from "../icons/AddBreakoutRoom.svg?react";
import BreakoutRoomsIcon from "../icons/BreakoutRooms.svg?react";

export type ButtonVariant =
  | "default"
  | "toolbar"
  | "toolbarSecondary"
  | "icon"
  | "secondary"
  | "copy"
  | "secondaryCopy"
  | "iconCopy"
  | "secondaryHangup"
  | "dropdown"
  | "link";

export const variantToClassName = {
  default: [styles.button],
  toolbar: [styles.toolbarButton],
  toolbarSecondary: [styles.toolbarButtonSecondary],
  icon: [styles.iconButton],
  secondary: [styles.secondary],
  copy: [styles.copyButton],
  secondaryCopy: [styles.secondaryCopy, styles.copyButton],
  iconCopy: [styles.iconCopyButton],
  secondaryHangup: [styles.secondaryHangup],
  dropdown: [styles.dropdownButton],
  link: [styles.linkButton],
};

export type ButtonSize = "lg";

export const sizeToClassName: { lg: string[] } = {
  lg: [styles.lg],
};
interface Props {
  variant: ButtonVariant;
  size: ButtonSize;
  on: () => void;
  off: () => void;
  iconStyle: string;
  className: string;
  children: Element[];
  onPress: (e: PressEvent) => void;
  onPressStart: (e: PressEvent) => void;
  disabled: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  (
    {
      variant = "default",
      size,
      on,
      off,
      iconStyle,
      className,
      children,
      onPress,
      onPressStart,
      ...rest
    },
    ref,
  ) => {
    const buttonRef = useObjectRef<HTMLButtonElement>(ref);
    const { buttonProps } = useButton(
      { onPress, onPressStart, ...rest },
      buttonRef,
    );

    // TODO: react-aria's useButton hook prevents form submission via keyboard
    // Remove the hack below after this is merged https://github.com/adobe/react-spectrum/pull/904
    let filteredButtonProps = buttonProps;

    if (rest.type === "submit" && !rest.onPress) {
      const { ...filtered } = buttonProps;
      filteredButtonProps = filtered;
    }

    return (
      <button
        className={classNames(
          variantToClassName[variant],
          sizeToClassName[size],
          styles[iconStyle],
          className,
          {
            [styles.on]: on,
            [styles.off]: off,
          },
        )}
        {...mergeProps(rest, filteredButtonProps)}
        ref={buttonRef}
      >
        <>
          {children}
          {variant === "dropdown" && <ChevronDownIcon />}
        </>
      </button>
    );
  },
);
Button.displayName = "Button";

export const ButtonWithDropdown: FC<{
  label: string;
  options: { label: string; id: string }[];
  onOptionSelect: (id: string) => void;
}> = ({ label, options, onOptionSelect, ...rest }) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(options[0].id);

  const onPress = useCallback(() => {
    onOptionSelect(selectedUserId);
  }, [onOptionSelect, selectedUserId]);

  const onSelectedOptionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSelectedUserId(event.target.options[event.target.selectedIndex].id);
    },
    [setSelectedUserId],
  );

  useEffect(() => {
    if (!options.find((o) => o.id === selectedUserId)) {
      setSelectedUserId(options[0].id);
    }
  }, [options, selectedUserId, setSelectedUserId]);

  return (
    <div className={styles.buttonWithDropdown}>
      <Tooltip label={label}>
        <Button onPress={onPress} {...rest}>
          {label}
        </Button>
      </Tooltip>
      <select onChange={onSelectedOptionChange}>
        {options.map((o) => (
          <option id={o.id}> {o.label}</option>
        ))}
      </select>
    </div>
  );
};

export const MicButton: FC<{
  muted: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ muted, ...rest }) => {
  const { t } = useTranslation();
  const Icon = muted ? MicOffSolidIcon : MicOnSolidIcon;
  const label = muted
    ? t("unmute_microphone_button_label")
    : t("mute_microphone_button_label");

  return (
    <Tooltip label={label}>
      <Button variant="toolbar" {...rest} on={muted}>
        <Icon aria-label={label} />
      </Button>
    </Tooltip>
  );
};

export const VideoButton: FC<{
  muted: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ muted, ...rest }) => {
  const { t } = useTranslation();
  const Icon = muted ? VideoCallOffSolidIcon : VideoCallSolidIcon;
  const label = muted
    ? t("start_video_button_label")
    : t("stop_video_button_label");

  return (
    <Tooltip label={label}>
      <Button variant="toolbar" {...rest} on={muted}>
        <Icon aria-label={label} />
      </Button>
    </Tooltip>
  );
};

export const ScreenshareButton: FC<{
  enabled: boolean;
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ enabled, className, ...rest }) => {
  const { t } = useTranslation();
  const label = enabled
    ? t("stop_screenshare_button_label")
    : t("screenshare_button_label");

  return (
    <Tooltip label={label}>
      <Button variant="toolbar" {...rest} on={enabled}>
        <ShareScreenSolidIcon aria-label={label} />
      </Button>
    </Tooltip>
  );
};

export const HangupButton: FC<{
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ className, ...rest }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("hangup_button_label")}>
      <Button
        variant="toolbar"
        className={classNames(styles.hangupButton, className)}
        {...rest}
      >
        <EndCallIcon aria-label={t("hangup_button_label")} />
      </Button>
    </Tooltip>
  );
};

export const SettingsButton: FC<{
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ className, ...rest }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("common.settings")}>
      <Button variant="toolbar" {...rest}>
        <SettingsSolidIcon aria-label={t("Settings")} />
      </Button>
    </Tooltip>
  );
};

export const AddBreakoutRoomButton: FC<{
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ ...rest }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Break-out room")}>
      <Button variant="toolbar" {...rest}>
        <AddBreakoutRoomIcon aria-label={t("Break-out room")} />
      </Button>
    </Tooltip>
  );
};

export const BreakoutRoomsButton: FC<{
  // TODO: add all props for <Button>
  [index: string]: unknown;
}> = ({ ...rest }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Break-out rooms")}>
      <Button variant="toolbar" {...rest}>
        <BreakoutRoomsIcon aria-label={t("Break-out rooms")} />
      </Button>
    </Tooltip>
  );
};

export const RemoveButton: FC<Omit<Props, "variant">> = ({ ...rest }) => {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Remove")}>
      <Button className={styles.removeButton} variant="icon" {...rest}>
        <RemoveIcon aria-label={t("Remove")} />
      </Button>
    </Tooltip>
  );
};
