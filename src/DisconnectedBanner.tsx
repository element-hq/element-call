/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import classNames from "classnames";
import { type FC, type HTMLAttributes, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import styles from "./DisconnectedBanner.module.css";
import { type ValidClientState, useClientState } from "./ClientContext";

interface Props extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  className?: string;
}

export const DisconnectedBanner: FC<Props> = ({
  children,
  className,
  ...rest
}) => {
  const { t } = useTranslation();
  const clientState = useClientState();
  let shouldShowBanner = false;

  if (clientState?.state === "valid") {
    const validClientState = clientState as ValidClientState;
    shouldShowBanner = validClientState.disconnected;
  }

  return (
    <>
      {shouldShowBanner && (
        <div className={classNames(styles.banner, className)} {...rest}>
          {children}
          {t("disconnected_banner")}
        </div>
      )}
    </>
  );
};
