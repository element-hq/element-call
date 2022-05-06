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

import { useObjectRef } from "@react-aria/utils";
import React, { useEffect } from "react";
import { useCallback } from "react";
import { useState } from "react";
import { forwardRef } from "react";
import { Avatar } from "../Avatar";
import { Button } from "../button";
import classNames from "classnames";
import { ReactComponent as EditIcon } from "../icons/Edit.svg";
import styles from "./AvatarInputField.module.css";

export const AvatarInputField = forwardRef(
  (
    { id, label, className, avatarUrl, displayName, onRemoveAvatar, ...rest },
    ref
  ) => {
    const [removed, setRemoved] = useState(false);
    const [objUrl, setObjUrl] = useState(null);

    const fileInputRef = useObjectRef(ref);

    useEffect(() => {
      const onChange = (e) => {
        if (e.target.files.length > 0) {
          setObjUrl(URL.createObjectURL(e.target.files[0]));
          setRemoved(false);
        } else {
          setObjUrl(null);
        }
      };

      fileInputRef.current.addEventListener("change", onChange);

      return () => {
        if (fileInputRef.current) {
          fileInputRef.current.removeEventListener("change", onChange);
        }
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
            size="xl"
            src={removed ? null : objUrl || avatarUrl}
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
            Remove
          </Button>
        )}
      </div>
    );
  }
);
