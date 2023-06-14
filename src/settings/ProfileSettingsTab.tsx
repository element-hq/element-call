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

import React, { useCallback, useEffect, useRef } from "react";
import { MatrixClient } from "matrix-js-sdk/src/client";
import { useTranslation } from "react-i18next";

import { useProfile } from "../profile/useProfile";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { AvatarInputField } from "../input/AvatarInputField";
import styles from "./ProfileSettingsTab.module.css";

interface Props {
  client: MatrixClient;
}
export function ProfileSettingsTab({ client }: Props) {
  const { t } = useTranslation();
  const { error, displayName, avatarUrl, saveProfile } = useProfile(client);

  const formRef = useRef<HTMLFormElement | null>(null);

  const formChanged = useRef(false);
  const onFormChange = useCallback(() => {
    formChanged.current = true;
  }, []);

  const removeAvatar = useRef(false);
  const onRemoveAvatar = useCallback(() => {
    removeAvatar.current = true;
    formChanged.current = true;
  }, []);

  useEffect(() => {
    const form = formRef.current!;
    // Auto-save when the user dismisses this component
    return () => {
      if (formChanged.current) {
        const data = new FormData(form);
        const displayNameDataEntry = data.get("displayName");
        const avatar = data.get("avatar");

        const avatarSize =
          typeof avatar == "string" ? avatar.length : avatar?.size ?? 0;
        const displayName =
          typeof displayNameDataEntry == "string"
            ? displayNameDataEntry
            : displayNameDataEntry?.name ?? null;

        saveProfile({
          displayName,
          avatar: avatar && avatarSize > 0 ? avatar : undefined,
          removeAvatar: removeAvatar.current && (!avatar || avatarSize === 0),
        });
      }
    };
  }, [saveProfile]);

  return (
    <form onChange={onFormChange} ref={formRef} className={styles.content}>
      <FieldRow className={styles.avatarFieldRow}>
        <AvatarInputField
          id="avatar"
          name="avatar"
          label={t("Avatar")}
          avatarUrl={avatarUrl}
          displayName={displayName}
          onRemoveAvatar={onRemoveAvatar}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="userId"
          name="userId"
          label={t("Username")}
          type="text"
          disabled
          value={client.getUserId()!}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="displayName"
          name="displayName"
          label={t("Display name")}
          type="text"
          required
          autoComplete="off"
          placeholder={t("Display name")}
          defaultValue={displayName}
          data-testid="profile_displayname"
        />
      </FieldRow>
      {error && (
        <FieldRow>
          <ErrorMessage error={error} />
        </FieldRow>
      )}
    </form>
  );
}
