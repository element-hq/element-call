/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentPropsWithoutRef, type FC } from "react";
import { Button } from "@vector-im/compound-web";
import { useTranslation } from "react-i18next";
import { UserAddIcon } from "@vector-im/compound-design-tokens/assets/web/icons";

export const InviteButton: FC<
  Omit<ComponentPropsWithoutRef<"button">, "children">
> = (props) => {
  const { t } = useTranslation();
  return (
    <Button kind="secondary" size="sm" Icon={UserAddIcon} {...props}>
      {t("action.invite")}
    </Button>
  );
};
