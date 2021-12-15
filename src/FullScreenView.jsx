import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ErrorMessage } from "./Input";
import styles from "./FullScreenView.module.css";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";
import classNames from "classnames";

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

  return (
    <FullScreenView>
      <h1>Error</h1>
      <ErrorMessage>{error.message}</ErrorMessage>
      {location.pathname !== "/" && (
        <Link className={styles.homeLink} to="/">
          Return to home screen
        </Link>
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
