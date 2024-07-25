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

import { ComponentPropsWithoutRef, FC } from "react";
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
