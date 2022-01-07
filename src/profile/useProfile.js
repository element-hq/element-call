import { useState, useCallback, useEffect } from "react";
import { getAvatarUrl } from "../matrix-utils";

export function useProfile(client) {
  const [{ loading, displayName, avatarUrl, error, success }, setState] =
    useState(() => {
      const user = client?.getUser(client.getUserId());

      return {
        success: false,
        loading: false,
        displayName: user?.displayName,
        avatarUrl: user && client && getAvatarUrl(client, user.avatarUrl),
        error: null,
      };
    });

  useEffect(() => {
    const onChangeUser = (_event, { displayName, avatarUrl }) => {
      setState({
        success: false,
        loading: false,
        displayName,
        avatarUrl: getAvatarUrl(client, avatarUrl),
        error: null,
      });
    };

    let user;

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
    async ({ displayName, avatar }) => {
      if (client) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: null,
          success: false,
        }));

        try {
          await client.setDisplayName(displayName);

          let mxcAvatarUrl;

          if (avatar) {
            mxcAvatarUrl = await client.uploadContent(avatar);
            await client.setAvatarUrl(mxcAvatarUrl);
          }

          setState((prev) => ({
            ...prev,
            displayName,
            avatarUrl: mxcAvatarUrl
              ? getAvatarUrl(client, mxcAvatarUrl)
              : prev.avatarUrl,
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
