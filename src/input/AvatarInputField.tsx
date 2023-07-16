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

import { useObjectRef } from "@react-aria/utils";
import {
  AllHTMLAttributes,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  ChangeEvent,
} from "react";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

import { Avatar, Size } from "../Avatar";
import { Button } from "../button";
import { ReactComponent as EditIcon } from "../icons/Edit.svg";
import styles from "./AvatarInputField.module.css";

interface Props extends AllHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  avatarUrl: string | undefined;
  displayName: string;
  onRemoveAvatar: () => void;
}

export const AvatarInputField = forwardRef<HTMLInputElement, Props>(
  (
    { id, label, className, avatarUrl, displayName, onRemoveAvatar, ...rest },
    ref
  ) => {
    const { t } = useTranslation();

    const [removed, setRemoved] = useState(false);
    const [objUrl, setObjUrl] = useState<string | undefined>(undefined);

    const fileInputRef = useObjectRef(ref);

    useEffect(() => {
      const currentInput = fileInputRef.current;

      const onChange = (e: Event) => {
        const inputEvent = e as unknown as ChangeEvent<HTMLInputElement>;
        if (inputEvent.target.files && inputEvent.target.files.length > 0) {
          setObjUrl(URL.createObjectURL(inputEvent.target.files[0]));
          setRemoved(false);
        } else {
          setObjUrl(undefined);
        }
      };

      currentInput.addEventListener("change", onChange);

      return () => {
        currentInput?.removeEventListener("change", onChange);
      };
    });

    const onPressRemoveAvatar = useCallback(() => {
      setRemoved(true);
      onRemoveAvatar();
    }, [onRemoveAvatar]);

    return (
      <div className={classNames(styles.avatarInputField, className)}>
        <div className={styles.avatarContainer}>
          <Avatar
            size={Size.XL}
            src={removed ? undefined : objUrl || avatarUrl}
            fallback={displayName.slice(0, 1).toUpperCase()}
          />
          <input
            id={id}
            accept="image/png, image/jpeg"
            ref={fileInputRef}
            type="file"
            className={styles.fileInput}
            role="button"
            aria-label={label}
            {...rest}
          />
          <label htmlFor={id} className={styles.fileInputButton}>
            <EditIcon />
          </label>
        </div>
        {(avatarUrl || objUrl) && !removed && (
          <Button
            className={styles.removeButton}
            variant="icon"
            onPress={onPressRemoveAvatar}
          >
            {t("Remove")}
          </Button>
        )}
      </div>
    );
  }
);
