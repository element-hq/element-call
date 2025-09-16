/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createContext,
  type FC,
  type MouseEvent,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Heading, IconButton, Tooltip } from "@vector-im/compound-web";
import { CollapseIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { useTranslation } from "react-i18next";

import { Header, LeftNav, RightNav } from "./Header";
import { platform } from "./Platform";
import styles from "./AppBar.module.css";

interface AppBarContext {
  setTitle: (value: string) => void;
  setSecondaryButton: (value: ReactNode) => void;
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
  const [hidden, setHidden] = useState<boolean>(false);
  const [secondaryButton, setSecondaryButton] = useState<ReactNode>(null);
  const context = useMemo(
    () => ({ setTitle, setSecondaryButton, setHidden }),
    [setTitle, setHidden, setSecondaryButton],
  );

  return (
    <>
      <div
        style={{ display: hidden ? "none" : "block" }}
        className={styles.bar}
      >
        <Header
          // App bar is mainly seen in the call view, which has its own
          // 'reconnecting' toast
          disconnectedBanner={false}
        >
          <LeftNav>
            <Tooltip label={t("common.back")}>
              <IconButton onClick={onBackClick}>
                <CollapseIcon />
              </IconButton>
            </Tooltip>
          </LeftNav>
          {title && (
            <Heading
              type="body"
              size="lg"
              weight={platform === "android" ? "medium" : "semibold"}
            >
              {title}
            </Heading>
          )}
          <RightNav>{secondaryButton}</RightNav>
        </Header>
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
 * React hook which sets the title to be shown in the app bar, if present. It is
 * an error to call this hook from multiple sites in the same component tree.
 */
export function useAppBarHidden(hidden: boolean): void {
  const setHidden = use(AppBarContext)?.setHidden;
  useEffect(() => {
    if (setHidden !== undefined) {
      setHidden(hidden);
      return (): void => setHidden(false);
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
    }
  }, [button, setSecondaryButton]);
}
