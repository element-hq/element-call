/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { FC, ReactNode, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import classNames from "classnames";
import { Trans, useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react";
import { logger } from "matrix-js-sdk/src/logger";
import { Button } from "@vector-im/compound-web";

import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import { LinkButton } from "./button";
import styles from "./FullScreenView.module.css";
import { TranslatedError } from "./TranslatedError";
import { Config } from "./config/Config";
import { RageshakeButton } from "./settings/RageshakeButton";
import { useUrlParams } from "./UrlParams";

interface FullScreenViewProps {
  className?: string;
  children: ReactNode;
}

export const FullScreenView: FC<FullScreenViewProps> = ({
  className,
  children,
}) => {
  const { hideHeader } = useUrlParams();
  return (
    <div className={classNames(styles.page, className)}>
      <Header>
        <LeftNav>{!hideHeader && <HeaderLogo />}</LeftNav>
        <RightNav />
      </Header>
      <div className={styles.container}>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
};

interface ErrorViewProps {
  error: Error;
}

export const ErrorView: FC<ErrorViewProps> = ({ error }) => {
  const location = useLocation();
  const { confineToRoom } = useUrlParams();
  const { t } = useTranslation();

  useEffect(() => {
    logger.error(error);
    Sentry.captureException(error);
  }, [error]);

  const onReload = useCallback(() => {
    window.location.href = "/";
  }, []);

  return (
    <FullScreenView>
      <h1>{t("common.error")}</h1>
      <p>
        {error instanceof TranslatedError
          ? error.translatedMessage
          : error.message}
      </p>
      <RageshakeButton description={`***Error View***: ${error.message}`} />
      {!confineToRoom &&
        (location.pathname === "/" ? (
          <Button className={styles.homeLink} onClick={onReload}>
            {t("return_home_button")}
          </Button>
        ) : (
          <LinkButton className={styles.homeLink} to="/">
            {t("return_home_button")}
          </LinkButton>
        ))}
    </FullScreenView>
  );
};

export const CrashView: FC = () => {
  const { t } = useTranslation();

  const onReload = useCallback(() => {
    window.location.href = "/";
  }, []);

  return (
    <FullScreenView>
      <Trans i18nKey="full_screen_view_h1">
        <h1>Oops, something's gone wrong.</h1>
      </Trans>
      {Config.get().rageshake?.submit_url && (
        <Trans i18nKey="full_screen_view_description">
          <p>Submitting debug logs will help us track down the problem.</p>
        </Trans>
      )}

      <RageshakeButton description="***Soft Crash***" />
      <Button className={styles.wideButton} onClick={onReload}>
        {t("return_home_button")}
      </Button>
    </FullScreenView>
  );
};

export const LoadingView: FC = () => {
  const { t } = useTranslation();

  return (
    <FullScreenView>
      <h1>{t("common.loading")}</h1>
    </FullScreenView>
  );
};
