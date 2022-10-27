import React, { ReactNode, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import classNames from "classnames";
import { Trans, useTranslation } from "react-i18next";

import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import { LinkButton, Button } from "./button";
import { useSubmitRageshake } from "./settings/submit-rageshake";
import { ErrorMessage } from "./input/Input";
import styles from "./FullScreenView.module.css";
import { translatedError, TranslatedError } from "./TranslatedError";

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
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  const sendDebugLogs = useCallback(() => {
    submitRageshake({
      description: "**Soft Crash**",
      sendLogs: true,
    });
  }, [submitRageshake]);

  const onReload = useCallback(() => {
    window.location.href = "/";
  }, []);

  let logsComponent: JSX.Element | null = null;
  if (sent) {
    logsComponent = <div>{t("Thanks! We'll get right on it.")}</div>;
  } else if (sending) {
    logsComponent = <div>{t("Sending…")}</div>;
  } else {
    logsComponent = (
      <Button
        size="lg"
        variant="default"
        onPress={sendDebugLogs}
        className={styles.wideButton}
      >
        {t("Send debug logs")}
      </Button>
    );
  }

  return (
    <FullScreenView>
      <Trans>
        <h1>Oops, something's gone wrong.</h1>
        <p>Submitting debug logs will help us track down the problem.</p>
      </Trans>
      <div className={styles.sendLogsSection}>{logsComponent}</div>
      {error && (
        <ErrorMessage error={translatedError("Couldn't send debug logs!", t)} />
      )}
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
