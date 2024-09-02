/*
Copyright 2022-2024 New Vector Ltd

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

import {
  AllHTMLAttributes,
  useEffect,
  useCallback,
  useState,
  ChangeEvent,
  useRef,
  FC,
} from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";
import { Button, Menu, MenuItem } from "@vector-im/compound-web";
import {
  DeleteIcon,
  EditIcon,
  ShareIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { Avatar, Size } from "../Avatar";
import styles from "./AvatarInputField.module.css";

interface Props extends AllHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  avatarUrl: string | undefined;
  userId: string;
  displayName: string;
  onRemoveAvatar: () => void;
}

export const AvatarInputField: FC<Props> = ({
  id,
  label,
  className,
  avatarUrl,
  userId,
  displayName,
  onRemoveAvatar,
  ...rest
}) => {
  const { t } = useTranslation();

  const [removed, setRemoved] = useState(false);
  const [objUrl, setObjUrl] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const currentInput = fileInputRef.current!;

    const onChange = (e: Event): void => {
      const inputEvent = e as unknown as ChangeEvent<HTMLInputElement>;
      if (inputEvent.target.files && inputEvent.target.files.length > 0) {
        setObjUrl(URL.createObjectURL(inputEvent.target.files[0]));
        setRemoved(false);
      } else {
        setObjUrl(undefined);
      }
    };

    currentInput.addEventListener("change", onChange);

    return (): void => {
      currentInput?.removeEventListener("change", onChange);
    };
  });

  const onSelectUpload = useCallback(() => {
    fileInputRef.current!.click();
  }, [fileInputRef]);

  const onSelectRemove = useCallback(() => {
    setRemoved(true);
    onRemoveAvatar();
  }, [onRemoveAvatar]);

  return (
    <div className={classNames(styles.avatarInputField, className)}>
      <Avatar
        id={userId}
        className={styles.avatar}
        name={displayName}
        size={Size.XL}
        src={removed ? undefined : objUrl || avatarUrl}
      />
      <input
        id={id}
        accept="image/*"
        ref={fileInputRef}
        type="file"
        className={styles.fileInput}
        role="button"
        aria-label={label}
        {...rest}
      />
      <div className={styles.edit}>
        {(avatarUrl || objUrl) && !removed ? (
          <Menu
            title={t("action.edit")}
            showTitle={false}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <Button
                iconOnly
                Icon={EditIcon}
                kind="tertiary"
                size="sm"
                aria-label={t("action.edit")}
              />
            }
          >
            <MenuItem
              Icon={ShareIcon}
              label={t("action.upload_file")}
              onSelect={onSelectUpload}
            />
            <MenuItem
              Icon={DeleteIcon}
              label={t("action.remove")}
              kind="critical"
              onSelect={onSelectRemove}
            />
          </Menu>
        ) : (
          <Button
            type="button"
            iconOnly
            Icon={EditIcon}
            kind="tertiary"
            size="sm"
            aria-label={t("action.edit")}
            onClick={onSelectUpload}
          />
        )}
      </div>
    </div>
  );
};

AvatarInputField.displayName = "AvatarInputField";
