/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useEffect, useState } from "react";
import { toDataURL } from "qrcode";
import classNames from "classnames";
import { t } from "i18next";

import styles from "./QrCode.module.css";

interface Props {
  data: string;
  className?: string;
}

export const QrCode: FC<Props> = ({ data, className }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    toDataURL(data, { errorCorrectionLevel: "L" })
      .then((url) => {
        if (!isCancelled) {
          setUrl(url);
        }
      })
      .catch((reason) => {
        if (!isCancelled) {
          setUrl(null);
        }
      });

    return (): void => {
      isCancelled = true;
    };
  }, [data]);

  return (
    <div className={classNames(styles.qrCode, className)}>
      {url && <img src={url} alt={t("qr_code")} />}
    </div>
  );
};
