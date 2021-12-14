import React from "react";
import { Link } from "react-router-dom";
import classNames from "classnames";
import styles from "./Button.module.css";

export function LinkButton({ className, children, ...rest }) {
  return (
    <Link className={classNames(styles.secondary, className)} {...rest}>
      {children}
    </Link>
  );
}
