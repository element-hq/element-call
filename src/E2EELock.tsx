/*
Copyright 2023 New Vector Ltd

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

import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import { useObjectRef } from "@react-aria/utils";
import { useButton } from "@react-aria/button";

import styles from "./E2EELock.module.css";
import { ReactComponent as LockOffIcon } from "./icons/LockOff.svg";
import { TooltipTrigger } from "./Tooltip";

export const E2EELock = () => {
  const { t } = useTranslation();
  const tooltip = useCallback(
    () => t("This call is not end-to-end encrypted."),
    [t]
  );

  return (
    <TooltipTrigger placement="right" tooltip={tooltip}>
      <Icon />
    </TooltipTrigger>
  );
};

/**
 * This component is a bit of hack - for some reason for the TooltipTrigger to
 * work, it needs to contain a component which uses the useButton hook; please
 * note that for some reason this also needs to be a separate component and we
 * cannot just use the useButton hook inside the E2EELock.
 */
const Icon = () => {
  const buttonRef = useObjectRef<HTMLDivElement>();
  const { buttonProps } = useButton({}, buttonRef);

  return (
    <div ref={buttonRef} className={styles.e2eeLock} {...buttonProps}>
      <LockOffIcon />
    </div>
  );
};
