import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ErrorMessage } from "./Input";
import styles from "./ErrorModal.module.css";
import { Header, HeaderLogo, LeftNav, RightNav } from "./Header";

export function ErrorModal({ error }) {
  const location = useLocation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <Header>
        <LeftNav>
          <HeaderLogo />
        </LeftNav>
        <RightNav />
      </Header>
      <div className={styles.container}>
        <div className={styles.content}>
          <h1>Error</h1>
          <ErrorMessage>{error.message}</ErrorMessage>
          <Link className={styles.homeLink} to="/">
            Return to home screen
          </Link>
        </div>
      </div>
    </>
  );
}
