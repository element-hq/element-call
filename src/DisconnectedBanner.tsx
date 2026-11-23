/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import classNames from "classnames";
import { type FC, type HTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import styles from "./DisconnectedBanner.module.css";
import { useDisconnected } from "./DisconnectedContext";

interface Props extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  className?: string;
}

/**
 * Shown while the signed-in client is supposed to be connected but is not.
 */
export const DisconnectedBanner: FC<Props> = ({
  children,
  className,
  ...rest
}) => {
  const { t } = useTranslation();
  const disconnected = useDisconnected();

  return (
    <>
      {disconnected && (
        <div className={classNames(styles.banner, className)} {...rest}>
          {children}
          {t("disconnected_banner")}
        </div>
      )}
    </>
  );
};
