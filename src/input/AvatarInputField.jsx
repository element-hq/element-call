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
        <Button
          className={styles.removeButton}
          variant="icon"
          onPress={onPressRemoveAvatar}
        >
          Remove
        </Button>
      </div>
    );
  }
);
