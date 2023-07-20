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

import { ReactNode, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import classNames from "classnames";
import { Trans, useTranslation } from "react-i18next";

import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import { LinkButton, Button } from "./button";
import styles from "./FullScreenView.module.css";
import { TranslatedError } from "./TranslatedError";
import { Config } from "./config/Config";
import { RageshakeButton } from "./settings/RageshakeButton";

interface FullScreenViewProps {
  className?: string;
  children: ReactNode;
}

export function FullScreenView({ className, children }: FullScreenViewProps) {
  return (
    <div className={classNames(styles.page, className)}>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav />
      </Header>
      <div className={styles.container}>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}

interface ErrorViewProps {
  error: Error;
}

export function ErrorView({ error }: ErrorViewProps) {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const onReload = useCallback(() => {
    window.location.href = "/";
  }, []);

  return (
    <FullScreenView>
      <h1>Error</h1>
      <p>
        {error instanceof TranslatedError
          ? error.translatedMessage
          : error.message}
      </p>
      {location.pathname === "/" ? (
        <Button
          size="lg"
          variant="default"
          className={styles.homeLink}
          onPress={onReload}
        >
          {t("Return to home screen")}
        </Button>
      ) : (
        <LinkButton
          size="lg"
          variant="default"
          className={styles.homeLink}
          to="/"
        >
          {t("Return to home screen")}
        </LinkButton>
      )}
    </FullScreenView>
  );
}

export function CrashView() {
  const { t } = useTranslation();

  const onReload = useCallback(() => {
    window.location.href = "/";
  }, []);

  return (
    <FullScreenView>
      <Trans>
        <h1>Oops, something's gone wrong.</h1>
      </Trans>
      {Config.get().rageshake?.submit_url && (
        <Trans>
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
        {t("Return to home screen")}
      </Button>
    </FullScreenView>
  );
}

export function LoadingView() {
  const { t } = useTranslation();

  return (
    <FullScreenView>
      <h1>{t("Loading…")}</h1>
    </FullScreenView>
  );
}
