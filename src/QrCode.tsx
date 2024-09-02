/*
Copyright 2024 New Vector Ltd

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

import { FC, useEffect, useState } from "react";
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

    toDataURL(data, { errorCorrectionLevel: "L" }).then((url) => {
      if (!isCancelled) {
        setUrl(url);
      }
    }).catch((reason) => {
      if (!isCancelled) {
        setUrl(null);
      }
    });

    return (): void => { isCancelled = true; };
  }, [data]);

  return (
    <div className={classNames(styles.qrCode, className)}>
        {url && <img src={url} alt={t("qr_code")} />}
    </div>
);
};

