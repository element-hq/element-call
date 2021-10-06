import React, { useEffect } from "react";
import { Center, Content, Modal } from "./Layout";
import { Link } from "react-router-dom";
import { ErrorMessage } from "./Input";
import styles from "./ErrorModal.module.css";

export function ErrorModal({ error }) {
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
              <Link to="/login">Login</Link>
            </p>
            <p>
              <Link to="/register">Register</Link>
            </p>
          </div>
        </Modal>
      </Center>
    </Content>
  );
}
