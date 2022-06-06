/*
Copyright 2022 Matrix.org Foundation C.I.C.

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

import { MatrixClient, User } from "matrix-js-sdk";
import { useState, useCallback, useEffect } from "react";

interface ProfileResult {
  loading: boolean;
  error: Error;
  displayName: string;
  avatarUrl: string;
  saveProfile: ({
    displayName,
    avatar,
    removeAvatar,
  }: {
    displayName: string;
    avatar: any;
    removeAvatar: boolean;
  }) => Promise<void>;
  success: boolean;
}
export function useProfile(client: MatrixClient): ProfileResult {
  const [{ loading, displayName, avatarUrl, error, success }, setState] =
    useState(() => {
      const user = client?.getUser(client.getUserId());

      return {
        success: false,
        loading: false,
        displayName: user?.rawDisplayName,
        avatarUrl: user?.avatarUrl,
        error: null,
      };
    });

  useEffect(() => {
    const onChangeUser = (_event: any, { displayName, avatarUrl }: any) => {
      setState({
        success: false,
        loading: false,
        displayName,
        avatarUrl,
        error: null,
      });
    };

    let user: User;

    if (client) {
      const userId = client.getUserId();
      user = client.getUser(userId);
      user.on("User.displayName", onChangeUser);
      user.on("User.avatarUrl", onChangeUser);
    }

    return () => {
      if (user) {
        user.removeListener("User.displayName", onChangeUser);
        user.removeListener("User.avatarUrl", onChangeUser);
      }
    };
  }, [client]);

  const saveProfile = useCallback(
    async ({ displayName, avatar, removeAvatar }) => {
      if (client) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: null,
          success: false,
        }));

        try {
          await client.setDisplayName(displayName);

          let mxcAvatarUrl: string;

          if (removeAvatar) {
            await client.setAvatarUrl("");
          } else if (avatar) {
            mxcAvatarUrl = await client.uploadContent(avatar);
            await client.setAvatarUrl(mxcAvatarUrl);
          }

          setState((prev) => ({
            ...prev,
            displayName,
            avatarUrl: removeAvatar ? null : mxcAvatarUrl ?? prev.avatarUrl,
            loading: false,
            success: true,
          }));
        } catch (error) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error,
            success: false,
          }));
        }
      } else {
        console.error("Client not initialized before calling saveProfile");
      }
    },
    [client]
  );

  return { loading, error, displayName, avatarUrl, saveProfile, success };
}
