import React, { useEffect } from "react";
import { Center, Content, Modal } from "./Layout";
import { Link, useLocation } from "react-router-dom";
import { ErrorMessage } from "./Input";
import styles from "./ErrorModal.module.css";

export function ErrorModal({ error }) {
  const location = useLocation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Content>
      <Center>
        <Modal>
          <h2>Error</h2>
          <div className={styles.errorModalContent}>
            <ErrorMessage>{error.message}</ErrorMessage>
            <p>
              <Link to={{ pathname: "/login", state: { from: location } }}>
                Login
              </Link>
            </p>
            <p>
              <Link to={{ pathname: "/register", state: { from: location } }}>
                Register
              </Link>
            </p>
          </div>
        </Modal>
      </Center>
    </Content>
  );
}
