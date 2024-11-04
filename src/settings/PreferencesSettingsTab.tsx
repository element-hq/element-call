/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { ChangeEvent, FC, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@vector-im/compound-web";

import { FieldRow, InputField } from "../input/Input";
import {
  showHandRaisedTimer as showHandRaisedTimerSetting,
  useSetting,
} from "./settings";

export const PreferencesSettingsTab: FC = () => {
  const { t } = useTranslation();
  const [showHandRaisedTimer, setShowHandRaisedTimer] = useSetting(
    showHandRaisedTimerSetting,
  );

  const onChangeSetting = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setShowHandRaisedTimer(e.target.checked);
    },
    [setShowHandRaisedTimer],
  );

  return (
    <div>
      <h4>{t("settings.preferences_tab_h4")}</h4>
      <Text>{t("settings.preferences_tab_body")}</Text>
      <FieldRow>
        <InputField
          id="showHandRaisedTimer"
          label={t("settings.preferences_tab_show_hand_raised_timer_label")}
          description={t(
            "settings.preferences_tab_show_hand_raised_timer_description",
          )}
          type="checkbox"
          checked={showHandRaisedTimer}
          onChange={onChangeSetting}
        />
      </FieldRow>
    </div>
  );
};
