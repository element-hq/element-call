/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "matrix-js-sdk/lib/logger";

import { useOwnProfile } from "../profile/useOwnProfile";
import { useMatrixDrivers } from "../driver/MatrixDriverContext";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { AvatarInputField } from "../input/AvatarInputField";
import styles from "./ProfileSettingsTab.module.css";

export const ProfileSettingsTab: FC = () => {
  const { t } = useTranslation();
  const { clientDriver } = useMatrixDrivers();
  const { displayName, avatarUrl } = useOwnProfile();
  const userId = clientDriver.userId;
  const [error, setError] = useState<Error | undefined>(undefined);
  // The driver may offer no way to edit the profile; then it is shown as is.
  const canEdit =
    clientDriver.setDisplayName !== undefined &&
    clientDriver.setAvatar !== undefined;
  const saveProfile = useCallback(
    async ({
      displayName,
      avatar,
      removeAvatar,
    }: {
      displayName: string;
      avatar: Blob | undefined;
      removeAvatar: boolean;
    }): Promise<void> => {
      try {
        await clientDriver.setDisplayName?.(displayName);
        if (removeAvatar) await clientDriver.setAvatar?.(null);
        else if (avatar) await clientDriver.setAvatar?.(avatar);
        setError(undefined);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        throw e;
      }
    },
    [clientDriver],
  );

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
          avatar: avatar instanceof Blob && avatarSize > 0 ? avatar : undefined,
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
        {displayName && (
          <AvatarInputField
            id="avatar"
            name="avatar"
            label={t("common.avatar")}
            avatarUrl={avatarUrl ?? undefined}
            userId={userId}
            displayName={displayName}
            onRemoveAvatar={onRemoveAvatar}
            disabled={!canEdit}
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
          value={userId}
        />
      </FieldRow>
      <FieldRow>
        <InputField
          id="displayName"
          name="displayName"
          label={t("common.display_name")}
          type="text"
          required
          disabled={!canEdit}
          autoComplete="off"
          placeholder={t("common.display_name")}
          defaultValue={displayName ?? undefined}
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
