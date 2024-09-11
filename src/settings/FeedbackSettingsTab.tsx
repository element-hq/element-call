/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { FC, useCallback } from "react";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { useTranslation } from "react-i18next";
import { Button } from "@vector-im/compound-web";

import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { useSubmitRageshake, useRageshakeRequest } from "./submit-rageshake";
import { Body } from "../typography/Typography";
import feedbackStyles from "../input/FeedbackInput.module.css";

interface Props {
  roomId?: string;
}

export const FeedbackSettingsTab: FC<Props> = ({ roomId }) => {
  const { t } = useTranslation();
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();
  const sendRageshakeRequest = useRageshakeRequest();

  const onSubmitFeedback = useCallback(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const descriptionData = data.get("description");
      const description =
        typeof descriptionData === "string" ? descriptionData : "";
      const sendLogs = Boolean(data.get("sendLogs"));
      const rageshakeRequestId = randomString(16);

      submitRageshake({
        description,
        sendLogs,
        rageshakeRequestId,
        roomId,
      });

      if (roomId && sendLogs) {
        sendRageshakeRequest(roomId, rageshakeRequestId);
      }
    },
    [submitRageshake, roomId, sendRageshakeRequest],
  );

  return (
    <div>
      <h4>{t("settings.feedback_tab_h4")}</h4>
      <Body>{t("settings.feedback_tab_body")}</Body>
      <form onSubmit={onSubmitFeedback}>
        <FieldRow>
          <InputField
            className={feedbackStyles.feedback}
            id="description"
            name="description"
            label={t("settings.feedback_tab_description_label")}
            placeholder={t("settings.feedback_tab_description_label")}
            type="textarea"
            disabled={sending || sent}
          />
        </FieldRow>
        {!sent && (
          <FieldRow>
            <InputField
              id="sendLogs"
              name="sendLogs"
              label={t("settings.feedback_tab_send_logs_label")}
              type="checkbox"
              defaultChecked
            />
            <Button type="submit" disabled={sending}>
              {sending ? t("submitting") : t("action.submit")}
            </Button>
          </FieldRow>
        )}
        <FieldRow>
          {error && <ErrorMessage error={error} />}
          {sent && <Body> {t("settings.feedback_tab_thank_you")}</Body>}
        </FieldRow>
      </form>
    </div>
  );
};
