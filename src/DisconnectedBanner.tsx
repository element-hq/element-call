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
import { useOptionalMatrixDrivers } from "./driver/MatrixDriverContext";
import { useHomeserverConnected } from "./driver/useHomeserverConnected";

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
  // Under a call the host's RTC driver says whether the homeserver is
  // reachable; the shell outside a call only has the client's sync state.
  const drivers = useOptionalMatrixDrivers();
  const homeserverConnected = useHomeserverConnected(drivers);
  const clientState = useClientState();
  let shouldShowBanner = false;

  if (drivers !== null) {
    shouldShowBanner = !homeserverConnected;
  } else if (clientState?.state === "valid") {
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
