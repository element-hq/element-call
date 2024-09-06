/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useTranslation } from "react-i18next";
import { FC, useCallback } from "react";
import { Button } from "@vector-im/compound-web";

import { Config } from "../config/Config";
import styles from "./RageshakeButton.module.css";
import { useSubmitRageshake } from "./submit-rageshake";

interface Props {
  description: string;
}

export const RageshakeButton: FC<Props> = ({ description }) => {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();
  const { t } = useTranslation();

  const sendDebugLogs = useCallback(() => {
    submitRageshake({
      description,
      sendLogs: true,
    });
  }, [submitRageshake, description]);

  if (!Config.get().rageshake?.submit_url) return null;

  let logsComponent: JSX.Element | null = null;
  if (sending) {
    logsComponent = <span>{t("rageshake_sending")}</span>;
  } else if (sent) {
    logsComponent = <div>{t("rageshake_sent")}</div>;
  } else {
    let caption = t("rageshake_send_logs");
    if (error) {
      caption = t("rageshake_button_error_caption");
    }

    logsComponent = (
      <Button
        onClick={sendDebugLogs}
        className={styles.wideButton}
        disabled={sending}
      >
        {caption}
      </Button>
    );
  }

  return <div className={styles.rageshakeControl}>{logsComponent}</div>;
};
