import React from "react";
import classNames from "classnames";
import styles from "./Layout.module.css";

export function Content({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.content, className)} {...rest}>
      {children}
    </div>
  );
}

export function Sidebar({ children, className, ...rest }) {
  return (
    <aside className={classNames(styles.sidebar, className)} {...rest}>
      {children}
    </aside>
  );
}

export function Center({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.center, className)} {...rest}>
      {children}
    </div>
  );
}

export function Modal({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.modal, className)} {...rest}>
      {children}
    </div>
  );
}

export function Info({ children, className, ...rest }) {
  return (
    <p className={classNames(styles.info, className)} {...rest}>
      {children}
    </p>
  );
}
