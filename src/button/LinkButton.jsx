import React from "react";
import { Link } from "react-router-dom";
import classNames from "classnames";
import { variantToClassName, sizeToClassName } from "./Button";

export function LinkButton({ className, variant, size, children, ...rest }) {
  return (
    <Link
      className={classNames(
        variantToClassName[variant || "secondary"],
        sizeToClassName[size],
        className
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
