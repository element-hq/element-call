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

import { ChangeEvent, FC, useCallback, useId } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@vector-im/compound-web";
import SpotlightViewIcon from "@vector-im/compound-design-tokens/icons/spotlight-view.svg?react";
import GridViewIcon from "@vector-im/compound-design-tokens/icons/grid-view.svg?react";
import classNames from "classnames";

import styles from "./LayoutToggle.module.css";

export type Layout = "spotlight" | "grid";

interface Props {
  layout: Layout;
  setLayout: (layout: Layout) => void;
  className?: string;
}

export const LayoutToggle: FC<Props> = ({ layout, setLayout, className }) => {
  const { t } = useTranslation();

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setLayout(e.target.value as Layout),
    [setLayout]
  );

  const spotlightId = useId();
  const gridId = useId();

  return (
    <div className={classNames(styles.toggle, className)}>
      <input
        id={spotlightId}
        type="radio"
        name="layout"
        value="spotlight"
        checked={layout === "spotlight"}
        onChange={onChange}
      />
      <Tooltip label={t("Spotlight")}>
        <label htmlFor={spotlightId}>
          <SpotlightViewIcon aria-label={t("Spotlight")} />
        </label>
      </Tooltip>
      <input
        id={gridId}
        type="radio"
        name="layout"
        value="grid"
        checked={layout === "grid"}
        onChange={onChange}
      />
      <Tooltip label={t("Grid")}>
        <label htmlFor={gridId}>
          <GridViewIcon aria-label={t("Grid")} />
        </label>
      </Tooltip>
    </div>
  );
};
