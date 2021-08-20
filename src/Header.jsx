import classNames from "classnames";
import React from "react";
import { Link } from "react-router-dom";
import styles from "./Header.module.css";
import { ReactComponent as Logo } from "./Logo.svg";

export function Header({ children, className, ...rest }) {
  return (
    <header className={classNames(styles.header, className)} {...rest}>
      {children}
    </header>
  );
}

export function LeftNav({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.leftNav, className)} {...rest}>
      <Link className={styles.logo} to="/">
        <Logo width={32} height={32} />
      </Link>
      {children}
    </div>
  );
}

export function CenterNav({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.centerNav, className)} {...rest}>
      {children}
    </div>
  );
}

export function RightNav({ children, className, ...rest }) {
  return (
    <div className={classNames(styles.rightNav, className)} {...rest}>
      {children}
    </div>
  );
}
