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
import { forwardRef, useCallback, useState } from "react";
import { PressEvent } from "@react-types/shared";
import classNames from "classnames";
import { useButton } from "@react-aria/button";
import { mergeProps, useObjectRef } from "@react-aria/utils";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@vector-im/compound-web";
import { ReactComponent as MicOnSolidIcon } from "@vector-im/compound-design-tokens/icons/mic-on-solid.svg";
import { ReactComponent as MicOffSolidIcon } from "@vector-im/compound-design-tokens/icons/mic-off-solid.svg";
import { ReactComponent as VideoCallIcon } from "@vector-im/compound-design-tokens/icons/video-call.svg";
import { ReactComponent as VideoCallOffIcon } from "@vector-im/compound-design-tokens/icons/video-call-off.svg";
import { ReactComponent as EndCallIcon } from "@vector-im/compound-design-tokens/icons/end-call.svg";
import { ReactComponent as ShareScreenSolidIcon } from "@vector-im/compound-design-tokens/icons/share-screen-solid.svg";
import { ReactComponent as SettingsSolidIcon } from "@vector-im/compound-design-tokens/icons/settings-solid.svg";
import { ReactComponent as ChevronDownIcon } from "@vector-im/compound-design-tokens/icons/chevron-down.svg";
import { ChangeEvent } from "react";

import styles from "./Button.module.css";
import { ReactComponent as Fullscreen } from "../icons/Fullscreen.svg";
import { ReactComponent as FullscreenExit } from "../icons/FullscreenExit.svg";
import { ReactComponent as RemoveIcon } from "../icons/Remove.svg";
import { ReactComponent as AddBreakoutRoomIcon } from "../icons/AddBreakoutRoom.svg";
import { ReactComponent as BreakoutRoomsIcon } from "../icons/BreakoutRooms.svg";
import { VolumeIcon } from "./VolumeIcon";

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
    ref
  ) => {
    const buttonRef = useObjectRef<HTMLButtonElement>(ref);
    const { buttonProps } = useButton(
      { onPress, onPressStart, ...rest },
      buttonRef
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
          }
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
  }
);

export function ButtonWithDropdown({
  label,
  options,
  onOptionSelect,
  ...rest
}: {
  label: string;
  options: { label: string; id: string }[];
  onOptionSelect: (id: string) => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>(options[0].id);

  const onPress = useCallback(() => {
    if (!selectedUserId) return;

    onOptionSelect(selectedUserId);
  }, [onOptionSelect, selectedUserId]);

  const onSelectedOptionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSelectedUserId(event.target.value);
    },
    [setSelectedUserId]
  );

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
}

export function MicButton({
  muted,
  ...rest
}: {
  muted: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();
  const Icon = muted ? MicOffSolidIcon : MicOnSolidIcon;
  const label = muted ? t("Unmute microphone") : t("Mute microphone");

  return (
    <Tooltip label={label}>
      <Button variant="toolbar" {...rest} on={muted}>
        <Icon aria-label={label} />
      </Button>
    </Tooltip>
  );
}

export function VideoButton({
  muted,
  ...rest
}: {
  muted: boolean;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();
  const Icon = muted ? VideoCallOffIcon : VideoCallIcon;
  const label = muted ? t("Start video") : t("Stop video");

  return (
    <Tooltip label={label}>
      <Button variant="toolbar" {...rest} on={muted}>
        <Icon aria-label={label} />
      </Button>
    </Tooltip>
  );
}

export function ScreenshareButton({
  enabled,
  className,
  ...rest
}: {
  enabled: boolean;
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();
  const label = enabled ? t("Sharing screen") : t("Share screen");

  return (
    <Tooltip label={label}>
      <Button variant="toolbar" {...rest} on={enabled}>
        <ShareScreenSolidIcon aria-label={label} />
      </Button>
    </Tooltip>
  );
}

export function HangupButton({
  className,
  ...rest
}: {
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("End call")}>
      <Button
        variant="toolbar"
        className={classNames(styles.hangupButton, className)}
        {...rest}
      >
        <EndCallIcon aria-label={t("End call")} />
      </Button>
    </Tooltip>
  );
}

export function SettingsButton({
  className,
  ...rest
}: {
  className?: string;
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Settings")}>
      <Button variant="toolbar" {...rest}>
        <SettingsSolidIcon aria-label={t("Settings")} />
      </Button>
    </Tooltip>
  );
}

export function AddBreakoutRoomButton({
  ...rest
}: {
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Break-out room")}>
      <Button variant="toolbar" {...rest}>
        <AddBreakoutRoomIcon aria-label={t("Break-out room")} />
      </Button>
    </Tooltip>
  );
}

export function BreakoutRoomsButton({
  ...rest
}: {
  // TODO: add all props for <Button>
  [index: string]: unknown;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Break-out rooms")}>
      <Button variant="toolbar" {...rest}>
        <BreakoutRoomsIcon aria-label={t("Break-out rooms")} />
      </Button>
    </Tooltip>
  );
}

interface AudioButtonProps extends Omit<Props, "variant"> {
  /**
   * A number between 0 and 1
   */
  volume: number;
}

export function AudioButton({ volume, ...rest }: AudioButtonProps) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Local volume")}>
      <Button variant="icon" {...rest}>
        <VolumeIcon volume={volume} aria-label={t("Local volume")} />
      </Button>
    </Tooltip>
  );
}

export function RemoveButton({ ...rest }: Omit<Props, "variant">) {
  const { t } = useTranslation();

  return (
    <Tooltip label={t("Remove")}>
      <Button className={styles.removeButton} variant="icon" {...rest}>
        <RemoveIcon aria-label={t("Remove")} />
      </Button>
    </Tooltip>
  );
}

interface FullscreenButtonProps extends Omit<Props, "variant"> {
  fullscreen?: boolean;
}

export function FullscreenButton({
  fullscreen,
  ...rest
}: FullscreenButtonProps) {
  const { t } = useTranslation();
  const Icon = fullscreen ? FullscreenExit : Fullscreen;
  const label = fullscreen ? t("Exit full screen") : t("Full screen");

  return (
    <Tooltip label={label}>
      <Button variant="icon" {...rest}>
        <Icon aria-label={label} />
      </Button>
    </Tooltip>
  );
}
