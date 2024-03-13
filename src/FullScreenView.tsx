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

import { FC, ReactNode, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import classNames from "classnames";
import { Trans, useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react";
import { logger } from "matrix-js-sdk/src/logger";

import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import { LinkButton, Button } from "./button";
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
      {location.pathname === "/" ? (
        <Button
          size="lg"
          variant="default"
          className={styles.homeLink}
          onPress={onReload}
        >
          {t("return_home_button")}
        </Button>
      ) : (
        <LinkButton
          size="lg"
          variant="default"
          className={styles.homeLink}
          to="/"
        >
          {t("return_home_button")}
        </LinkButton>
      )}
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
      <Button
        size="lg"
        variant="default"
        className={styles.wideButton}
        onPress={onReload}
      >
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
