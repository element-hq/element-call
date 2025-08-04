/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useEffect, useMemo, useRef } from "react";
import { type MatrixClient } from "matrix-js-sdk";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";

import { useProfile } from "../profile/useProfile";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { AvatarInputField } from "../input/AvatarInputField";
import styles from "./ProfileSettingsTab.module.css";

interface Props {
  client: MatrixClient;
}
export const ProfileSettingsTab: FC<Props> = ({ client }) => {
  const { t } = useTranslation();
  const { error, displayName, avatarUrl, saveProfile } = useProfile(client);
  const userId = useMemo(() => client.getUserId(), [client]);

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
    return (): void => {
      if (formChanged.current) {
        const data = new FormData(form);
        const displayNameDataEntry = data.get("displayName");
        const avatar = data.get("avatar");

        const avatarSize =
          typeof avatar == "string" ? avatar.length : (avatar?.size ?? 0);
        const displayName =
          typeof displayNameDataEntry == "string"
            ? displayNameDataEntry
            : (displayNameDataEntry?.name ?? null);

        if (!displayName) {
          return;
        }

        saveProfile({
          displayName,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          avatar: avatar && avatarSize > 0 ? avatar : undefined,
          removeAvatar: removeAvatar.current && (!avatar || avatarSize === 0),
        }).catch((e) => {
          logger.error("Failed to save profile", e);
        });
      }
    };
  }, [saveProfile]);

  return (
    <form onChange={onFormChange} ref={formRef} className={styles.content}>
      <FieldRow className={styles.avatarFieldRow}>
        {userId && displayName && (
          <AvatarInputField
            id="avatar"
            name="avatar"
            label={t("common.avatar")}
            avatarUrl={avatarUrl}
            userId={userId}
            displayName={displayName}
            onRemoveAvatar={onRemoveAvatar}
          />
        )}
      </FieldRow>
      <FieldRow>
        <InputField
          id="userId"
          name="userId"
          label={t("common.username")}
          type="text"
          disabled
          value={client.getUserId()!}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="displayName"
          name="displayName"
          label={t("common.display_name")}
          type="text"
          required
          autoComplete="off"
          placeholder={t("common.display_name")}
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
};
