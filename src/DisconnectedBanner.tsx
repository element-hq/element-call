/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import classNames from "classnames";
import {
  type FC,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ClientEvent, type MatrixClient } from "matrix-js-sdk";
import { type ISyncStateData, type SyncState } from "matrix-js-sdk/lib/sync";

import styles from "./DisconnectedBanner.module.css";
import { useClient } from "./ClientContext";

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
  const { client } = useClient();
  // Tagged with the client it describes, so that a swapped client does not
  // inherit the old one's verdict before its first sync
  const [disconnected, setDisconnected] = useState<
    [MatrixClient, boolean] | null
  >(null);

  useEffect(() => {
    if (client === undefined) return;
    const onSync = (
      syncState: SyncState,
      _old: SyncState | null,
      data?: ISyncStateData,
    ): void => {
      const clientIsDisconnected =
        syncState === "ERROR" && data?.error?.name === "ConnectionError";
      setDisconnected([client, clientIsDisconnected]);
    };
    client.on(ClientEvent.Sync, onSync);
    return (): void => {
      client.removeListener(ClientEvent.Sync, onSync);
    };
  }, [client]);

  const shouldShowBanner =
    disconnected !== null && disconnected[0] === client && disconnected[1];

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
