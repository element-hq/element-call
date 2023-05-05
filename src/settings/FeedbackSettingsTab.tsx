/*
Copyright 2022 - 2023 New Vector Ltd

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

import React, { useCallback } from "react";
import { randomString } from "matrix-js-sdk/src/randomstring";
import { useTranslation } from "react-i18next";

import { Button } from "../button";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { useSubmitRageshake, useRageshakeRequest } from "./submit-rageshake";
import { Body } from "../typography/Typography";

interface Props {
  roomId?: string;
}

export function FeedbackSettingsTab({ roomId }: Props) {
  const { t } = useTranslation();
  const { submitRageshake, sending, error } = useSubmitRageshake();
  const sendRageshakeRequest = useRageshakeRequest();

  const onSubmitFeedback = useCallback(
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
    [submitRageshake, roomId, sendRageshakeRequest]
  );

  return (
    <div>
      <Body>{t("Having trouble? Help us fix it.")}</Body>
      <form onSubmit={onSubmitFeedback}>
        <FieldRow>
          <InputField
            id="description"
            name="description"
            label={t("Description (optional)")}
            type="textarea"
          />
        </FieldRow>
        <FieldRow>
          <InputField
            id="sendLogs"
            name="sendLogs"
            label={t("Include debug logs")}
            type="checkbox"
            defaultChecked
          />
        </FieldRow>
        {error && (
          <FieldRow>
            <ErrorMessage error={error} />
          </FieldRow>
        )}
        <FieldRow>
          <Button type="submit" disabled={sending}>
            {sending ? t("Submitting feedback…") : t("Submit feedback")}
          </Button>
        </FieldRow>
      </form>
    </div>
  );
}
