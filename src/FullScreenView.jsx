import React, { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import styles from "./FullScreenView.module.css";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import classNames from "classnames";
import { LinkButton, Button } from "./button";
import { useSubmitRageshake } from "./settings/submit-rageshake";
import { ErrorMessage } from "./input/Input";

export function FullScreenView({ className, children }) {
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

export function ErrorView({ error }) {
  const location = useLocation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const onReload = useCallback(() => {
    window.location = "/";
  }, []);

  return (
    <FullScreenView>
      <h1>Error</h1>
      <p>{error.message}</p>
      {location.pathname === "/" ? (
        <Button
          size="lg"
          variant="default"
          className={styles.homeLink}
          onPress={onReload}
        >
          Return to home screen
        </Button>
      ) : (
        <LinkButton
          size="lg"
          variant="default"
          className={styles.homeLink}
          to="/"
        >
          Return to home screen
        </LinkButton>
      )}
    </FullScreenView>
  );
}

export function CrashView() {
  const { submitRageshake, sending, sent, error } = useSubmitRageshake();

  const sendDebugLogs = useCallback(() => {
    submitRageshake({
      description: "**Soft Crash**",
      sendLogs: true,
    });
  }, [submitRageshake]);

  const onReload = useCallback(() => {
    window.location = "/";
  }, []);

  let logsComponent;
  if (sent) {
    logsComponent = <div>Thanks! We'll get right on it.</div>;
  } else if (sending) {
    logsComponent = <div>Sending...</div>;
  } else {
    logsComponent = (
      <Button
        size="lg"
        variant="default"
        onPress={sendDebugLogs}
        className={styles.wideButton}
      >
        Send debug logs
      </Button>
    );
  }

  return (
    <FullScreenView>
      <h1>Oops, something's gone wrong.</h1>
      <p>Submitting debug logs will help us track down the problem.</p>
      <div className={styles.sendLogsSection}>{logsComponent}</div>
      {error && <ErrorMessage>Couldn't send debug logs!</ErrorMessage>}
      <Button
        size="lg"
        variant="default"
        className={styles.wideButton}
        onPress={onReload}
      >
        Return to home screen
      </Button>
    </FullScreenView>
  );
}

export function LoadingView() {
  return (
    <FullScreenView>
      <h1>Loading...</h1>
    </FullScreenView>
  );
}
