import classNames from "classnames";
import React, { forwardRef } from "react";
import styles from "./Form.module.css";

export const Form = forwardRef(({ children, className, ...rest }, ref) => {
  return (
    <form {...rest} className={classNames(styles.form, className)} ref={ref}>
      {children}
    </form>
  );
});
