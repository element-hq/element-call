import React, { useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import styles from "./FullScreenView.module.css";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import classNames from "classnames";
import { LinkButton, Button } from "./button";

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

export function LoadingView() {
  return (
    <FullScreenView>
      <h1>Loading...</h1>
    </FullScreenView>
  );
}
