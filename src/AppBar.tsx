/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  createContext,
  type FC,
  type MouseEvent,
  type ReactNode,
} from "react";
import classNames from "classnames";
import { Heading, IconButton, Text, Tooltip } from "@vector-im/compound-web";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  CollapseIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";

import { platform } from "./Platform";
import styles from "./AppBar.module.css";

interface AppBarContext {
  setTitle: (value: string) => void;
  setSubtitle: (value: ReactNode) => void;
  setSecondaryButton: (value: ReactNode) => void;
  setPrimaryButtonIconKind: (value: "back" | "minimise") => void;
  setHidden: (value: boolean) => void;
}

const AppBarContext = createContext<AppBarContext | null>(null);

interface Props {
  children: ReactNode;
}

/**
 * A "top app bar" featuring a back button, title and possibly a secondary
 * button, similar to what you might see in mobile apps.
 */
export const AppBar: FC<Props> = ({ children }) => {
  const { t } = useTranslation();
  const onBackClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    window.controls.onBackButtonPressed?.();
  }, []);

  const [title, setTitle] = useState<string>("");
  const [subtitle, setSubtitle] = useState<ReactNode>(undefined);
  const [hidden, setHidden] = useState<boolean>(false);
  const [secondaryButton, setSecondaryButton] = useState<ReactNode | null>(
    null,
  );
  const [primaryButtonIcon, setPrimaryButtonIconKind] = useState<
    "back" | "minimise"
  >("minimise");

  const context = useMemo(
    () => ({
      setTitle,
      setSubtitle,
      setSecondaryButton,
      setHidden,
      setPrimaryButtonIconKind,
    }),
    [
      setTitle,
      setSubtitle,
      setHidden,
      setSecondaryButton,
      setPrimaryButtonIconKind,
    ],
  );

  const BackIcon = platform === "android" ? ArrowLeftIcon : ChevronLeftIcon;

  return (
    <>
      {/* Wrap the header in a div due to annoying z-index issues with the
      gradient background */}
      <div className={classNames(styles.bar, { [styles.hidden]: hidden })}>
        <header>
          <Tooltip label={t("common.back")}>
            <IconButton
              className={styles.primaryButton}
              // We render the back button (PrimaryButtonIcon) the same size as the native os.
              // We render the minimise icon (default) smaller as per designs.
              size={primaryButtonIcon === "back" ? "32px" : "24px"}
              onClick={onBackClick}
            >
              {primaryButtonIcon === "back" ? (
                <BackIcon aria-hidden />
              ) : (
                <CollapseIcon aria-hidden />
              )}
            </IconButton>
          </Tooltip>
          {title && (
            <Heading
              className={styles.title}
              type="body"
              size={platform === "ios" ? "md" : "lg"}
              weight={platform === "ios" ? "semibold" : "medium"}
            >
              {title}
            </Heading>
          )}
          {subtitle && (
            <Text
              className={styles.subtitle}
              as="span"
              size={platform === "ios" ? "sm" : "lg"}
            >
              {subtitle}
            </Text>
          )}
          <div className={styles.secondaryButton}>{secondaryButton}</div>
        </header>
      </div>
      <AppBarContext value={context}>{children}</AppBarContext>
    </>
  );
};

/**
 * React hook which sets the title to be shown in the app bar, if present. It is
 * an error to call this hook from multiple sites in the same component tree.
 */
export function useAppBarTitle(title: string): void {
  const setTitle = use(AppBarContext)?.setTitle;
  useEffect(() => {
    if (setTitle !== undefined) {
      setTitle(title);
      return (): void => setTitle("");
    }
  }, [title, setTitle]);
}

/**
 * React hook which sets the subtitle to be shown in the app bar, if present. It
 * is an error to call this hook from multiple sites in the same component tree.
 */
export function useAppBarSubtitle(subtitle: ReactNode): void {
  const setSubtitle = use(AppBarContext)?.setSubtitle;
  useEffect(() => {
    if (setSubtitle !== undefined) {
      setSubtitle(subtitle);
      return (): void => setSubtitle("");
    }
  }, [subtitle, setSubtitle]);
}

/**
 * React hook which sets the primary button icon kind. Can only be "minimise" or "back"
 * It is an error to call this hook from multiple sites in the same component tree.
 */
export function useAppBarPrimaryButtonIconKind(
  icon: "back" | "minimise",
): void {
  const setIconKind = use(AppBarContext)?.setPrimaryButtonIconKind;
  useEffect(() => {
    if (setIconKind !== undefined) {
      setIconKind(icon);
      return (): void => setIconKind("minimise");
    }
  }, [setIconKind, icon]);
}

/**
 * React hook which sets the title to be shown in the app bar, if present. It is
 * an error to call this hook from multiple sites in the same component tree.
 */
export function useAppBarHidden(hidden: boolean): void {
  const setHidden = use(AppBarContext)?.setHidden;
  useEffect(() => {
    if (setHidden !== undefined) {
      setHidden(hidden);
      return (): void => setHidden(false);
    } else if (platform !== "desktop") {
      logger.warn(
        "[AppBar] useAppBarHidden called without AppBarContext provider, this will have no effect",
      );
    }
  }, [setHidden, hidden]);
}

/**
 * React hook which sets the secondary button to be shown in the app bar, if
 * present. It is an error to call this hook from multiple sites in the same
 * component tree.
 */
export function useAppBarSecondaryButton(button: ReactNode): void {
  const setSecondaryButton = use(AppBarContext)?.setSecondaryButton;
  useEffect(() => {
    if (setSecondaryButton !== undefined) {
      setSecondaryButton(button);
      return (): void => setSecondaryButton("");
    } else if (platform !== "desktop") {
      logger.warn(
        "[AppBar] useAppBarSecondaryButton called without AppBarContext provider, this will have no effect",
      );
    }
  }, [button, setSecondaryButton]);
}
