import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../button";
import { useProfile } from "./useProfile";
import { FieldRow, InputField, ErrorMessage } from "../input/Input";
import { Modal, ModalContent } from "../Modal";

export function ProfileModal({
  client,
  isAuthenticated,
  isPasswordlessUser,
  ...rest
}) {
  const { onClose } = rest;
  const {
    success,
    error,
    loading,
    displayName: initialDisplayName,
    saveProfile,
  } = useProfile(client);
  const [displayName, setDisplayName] = useState(initialDisplayName || "");

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
      });
    },
    [saveProfile]
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
          {isAuthenticated && (
            <FieldRow>
              <InputField
                type="file"
                id="avatar"
                name="avatar"
                label="Avatar"
              />
            </FieldRow>
          )}
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
