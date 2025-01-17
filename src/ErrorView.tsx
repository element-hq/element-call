/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { BigIcon, Button, Heading } from "@vector-im/compound-web";
import {
  useCallback,
  type ComponentType,
  type FC,
  type ReactNode,
  type SVGAttributes,
} from "react";
import { useTranslation } from "react-i18next";

import { RageshakeButton } from "./settings/RageshakeButton";
import styles from "./ErrorView.module.css";
import { useUrlParams } from "./UrlParams";
import { LinkButton } from "./button";

interface Props {
  Icon: ComponentType<SVGAttributes<SVGElement>>;
  title: string;
  /**
   * Show an option to submit a rageshake.
   * @default false
   */
  rageshake?: boolean;
  /**
   * Whether the error is considered fatal, i.e. non-recoverable. Causes the app
   * to fully reload when clicking 'return to home'.
   * @default false
   */
  fatal?: boolean;
  children: ReactNode;
}

export const ErrorView: FC<Props> = ({
  Icon,
  title,
  rageshake,
  fatal,
  children,
}) => {
  const { t } = useTranslation();
  const { confineToRoom } = useUrlParams();

  const onReload = useCallback(() => {
    window.location.href = "/";
  }, []);

  return (
    <div className={styles.error}>
      <BigIcon className={styles.icon}>
        <Icon />
      </BigIcon>
      <Heading as="h1" weight="semibold" size="md">
        {title}
      </Heading>
      {children}
      {rageshake && (
        <RageshakeButton description={`***Error View***: ${title}`} />
      )}
      {!confineToRoom &&
        (fatal || location.pathname === "/" ? (
          <Button
            kind="tertiary"
            className={styles.homeLink}
            onClick={onReload}
          >
            {t("return_home_button")}
          </Button>
        ) : (
          <LinkButton kind="tertiary" className={styles.homeLink} to="/">
            {t("return_home_button")}
          </LinkButton>
        ))}
    </div>
  );
};
