/*
Copyright 2024-2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ComponentPropsWithoutRef,
  type FC,
  forwardRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, Button as CpdButton, Tooltip } from "@vector-im/compound-web";
import {
  EndCallIcon,
  LeaveIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import styles from "./EndCallMenuButton.module.css";

const CONFIRMATION_TIMEOUT_MS = 3000;

interface EndCallMenuButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "onClick"> {
  /**
   * Callback to leave the call (only for yourself).
   */
  onLeave: () => void;
  /**
   * Callback to terminate the call for all participants.
   */
  onTerminate: () => void;
  /**
   * Number of participants currently in the call.
   */
  participantCount: number;
}

const EndCallMenuTriggerButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<"button"> & {
    tooltipLabel: string;
  }
>(({ tooltipLabel, className, disabled, ...props }, ref) => (
  <Tooltip label={tooltipLabel}>
    <CpdButton
      {...props}
      ref={ref}
      className={classNames(className, styles.endCallButton)}
      iconOnly
      Icon={EndCallIcon}
      destructive
      disabled={disabled}
      aria-label={tooltipLabel}
    />
  </Tooltip>
));
EndCallMenuTriggerButton.displayName = "EndCallMenuTriggerButton";

/**
 * A button that provides options to leave or terminate the call.
 * Shows a dropdown menu with:
 * - "Leave call" - leaves the call for yourself
 * - "End for everyone" - terminates the call for all participants (requires confirmation)
 */
export const EndCallMenuButton: FC<EndCallMenuButtonProps> = ({
  onLeave,
  onTerminate,
  participantCount,
  className,
  disabled,
  ...props
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Reset confirming state after timeout
  useEffect(() => {
    if (!confirming) return;

    const timeout = setTimeout(() => {
      setConfirming(false);
    }, CONFIRMATION_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [confirming]);

  // Reset confirming state when menu closes
  useEffect(() => {
    if (!open) {
      setConfirming(false);
    }
  }, [open]);

  const handleLeave = useCallback(() => {
    setOpen(false);
    onLeave();
  }, [onLeave]);

  const handleTerminate = useCallback((e: Event) => {
    if (confirming) {
      // Second click - actually terminate
      onTerminate();
      setConfirming(false);
      setOpen(false);
    } else {
      // First click - enter confirming state
      e.preventDefault();
      setConfirming(true);
    }
  }, [confirming, onTerminate]);

  const showTerminateOption = participantCount > 1;
  const tooltipLabel = t("hangup_button_label");

  return (
    <Menu
      title={t("end_call_menu_label")}
      showTitle={false}
      align="center"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <EndCallMenuTriggerButton
          {...props}
          className={className}
          disabled={disabled}
          tooltipLabel={tooltipLabel}
        />
      }
    >
      <MenuItem
        Icon={LeaveIcon}
        label={t("leave_call_button")}
        onSelect={handleLeave}
        data-testid="end_call_menu_leave"
      />
      {showTerminateOption && (
        <MenuItem
          Icon={EndCallIcon}
          label={
            confirming
              ? t("terminate_call_confirm", { count: participantCount })
              : t("terminate_call_button")
          }
          onSelect={handleTerminate}
          kind="critical"
          className={classNames(styles.terminateItem, {
            [styles.confirming]: confirming,
          })}
          data-testid="end_call_menu_terminate"
        />
      )}
    </Menu>
  );
};
