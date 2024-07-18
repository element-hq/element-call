/*
Copyright 2022 New Vector Ltd

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

import { MatrixClient } from "matrix-js-sdk/src/client";
import { MatrixEvent } from "matrix-js-sdk/src/models/event";
import { User, UserEvent } from "matrix-js-sdk/src/models/user";
import { FileType } from "matrix-js-sdk/src/http-api";
import { useState, useCallback, useEffect } from "react";
import { logger } from "matrix-js-sdk/src/logger";

interface ProfileLoadState {
  success: boolean;
  loading: boolean;
  displayName?: string;
  avatarUrl?: string;
  error?: Error;
}

type ProfileSaveCallback = ({
  displayName,
  avatar,
  removeAvatar,
}: {
  displayName: string;
  avatar: FileType;
  removeAvatar: boolean;
}) => Promise<void>;

interface UseProfile extends ProfileLoadState {
  saveProfile: ProfileSaveCallback;
}

export function useProfile(client: MatrixClient | undefined): UseProfile {
  const [{ success, loading, displayName, avatarUrl, error }, setState] =
    useState<ProfileLoadState>(() => {
      let user: User | undefined = undefined;
      if (client) {
        user = client.getUser(client.getUserId()!) ?? undefined;
      }

      return {
        success: false,
        loading: false,
        displayName: user?.rawDisplayName,
        avatarUrl: user?.avatarUrl,
        error: undefined,
      };
    });

  useEffect(() => {
    const onChangeUser = (
      _event: MatrixEvent | undefined,
      { displayName, avatarUrl }: User,
    ): void => {
      setState({
        success: false,
        loading: false,
        displayName,
        avatarUrl,
        error: undefined,
      });
    };

    let user: User | null;
    if (client) {
      const userId = client.getUserId()!;
      user = client.getUser(userId);
      user?.on(UserEvent.DisplayName, onChangeUser);
      user?.on(UserEvent.AvatarUrl, onChangeUser);
    }

    return (): void => {
      if (user) {
        user.removeListener(UserEvent.DisplayName, onChangeUser);
        user.removeListener(UserEvent.AvatarUrl, onChangeUser);
      }
    };
  }, [client]);

  const saveProfile = useCallback<ProfileSaveCallback>(
    async ({ displayName, avatar, removeAvatar }) => {
      if (client) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: undefined,
          success: false,
        }));

        try {
          await client.setDisplayName(displayName);

          let mxcAvatarUrl: string;

          if (removeAvatar) {
            await client.setAvatarUrl("");
          } else if (avatar) {
            ({ content_uri: mxcAvatarUrl } =
              await client.uploadContent(avatar));
            await client.setAvatarUrl(mxcAvatarUrl);
          }

          setState((prev) => ({
            ...prev,
            displayName,
            avatarUrl: removeAvatar
              ? undefined
              : (mxcAvatarUrl ?? prev.avatarUrl),
            loading: false,
            success: true,
          }));
        } catch (error: unknown) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error : Error(error as string),
            success: false,
          }));
        }
      } else {
        logger.error("Client not initialized before calling saveProfile");
      }
    },
    [client],
  );

  return {
    loading,
    error,
    displayName,
    avatarUrl,
    saveProfile,
    success,
  };
}
