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

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../button";
import { useProfile } from "./useProfile";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Modal, ModalContent } from "../Modal";
import { AvatarInputField } from "../input/AvatarInputField";
import styles from "./ProfileModal.module.css";

export function ProfileModal({ client, ...rest }) {
  const { onClose } = rest;
  const {
    success,
    error,
    loading,
    displayName: initialDisplayName,
    avatarUrl,
    saveProfile,
  } = useProfile(client);
  const [displayName, setDisplayName] = useState(initialDisplayName || "");
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const onRemoveAvatar = useCallback(() => {
    setRemoveAvatar(true);
  }, []);

  const onChangeDisplayName = useCallback(
    (e) => {
      setDisplayName(e.target.value);
    },
    [setDisplayName]
  );

  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const displayName = data.get("displayName");
      const avatar = data.get("avatar");

      saveProfile({
        displayName,
        avatar: avatar && avatar.size > 0 ? avatar : undefined,
        removeAvatar: removeAvatar && (!avatar || avatar.size === 0),
      });
    },
    [saveProfile, removeAvatar]
  );

  useEffect(() => {
    if (success) {
      onClose();
    }
  }, [success, onClose]);

  return (
    <Modal title="Profile" isDismissable {...rest}>
      <ModalContent>
        <form onSubmit={onSubmit}>
          <FieldRow className={styles.avatarFieldRow}>
            <AvatarInputField
              id="avatar"
              name="avatar"
              label="Avatar"
              avatarUrl={avatarUrl}
              displayName={displayName}
              onRemoveAvatar={onRemoveAvatar}
            />
          </FieldRow>
          <FieldRow>
            <InputField
              id="userId"
              name="userId"
              label="User Id"
              type="text"
              disabled
              value={client.getUserId()}
            />
          </FieldRow>
          <FieldRow>
            <InputField
              id="displayName"
              name="displayName"
              label="Display Name"
              type="text"
              required
              autoComplete="off"
              placeholder="Display Name"
              value={displayName}
              onChange={onChangeDisplayName}
            />
          </FieldRow>
          {error && (
            <FieldRow>
              <ErrorMessage>{error.message}</ErrorMessage>
            </FieldRow>
          )}
          <FieldRow rightAlign>
            <Button type="button" variant="secondary" onPress={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </FieldRow>
        </form>
      </ModalContent>
    </Modal>
  );
}
