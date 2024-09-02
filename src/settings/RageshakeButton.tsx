/*
Copyright 2023 New Vector Ltd

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
