import React from "react";
import { Modal, ModalContent } from "./Modal";
import { Button } from "./button";
import { FieldRow } from "./Input";
import styles from "./JoinExistingCallModal.module.css";

export function JoinExistingCallModal({ onJoin, ...rest }) {
  return (
    <Modal title="Join existing call?" isDismissable {...rest}>
      <ModalContent>
        <p>This call already exists, would you like to join?</p>
        <FieldRow rightAlign className={styles.buttons}>
          <Button onPress={rest.onClose}>No</Button>
          <Button onPress={onJoin}>Yes, join call</Button>
        </FieldRow>
      </ModalContent>
    </Modal>
  );
}
