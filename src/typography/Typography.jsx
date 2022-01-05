import React, { forwardRef } from "react";
import classNames from "classnames";
import { Link as RouterLink } from "react-router-dom";
import styles from "./Typography.module.css";

export const Headline = forwardRef(
  ({ as: Component = "h1", children, className, fontWeight, ...rest }, ref) => {
    return (
      <Component
        {...rest}
        className={classNames(styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Title = forwardRef(
  ({ as: Component = "h2", children, className, fontWeight, ...rest }, ref) => {
    return (
      <Component
        {...rest}
        className={classNames(styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Subtitle = forwardRef(
  ({ as: Component = "h3", children, className, fontWeight, ...rest }, ref) => {
    return (
      <Component
        {...rest}
        className={classNames(styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Body = forwardRef(
  ({ as: Component = "p", children, className, fontWeight, ...rest }, ref) => {
    return (
      <Component
        {...rest}
        className={classNames(styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Caption = forwardRef(
  ({ as: Component = "p", children, className, fontWeight, ...rest }, ref) => {
    return (
      <Component
        {...rest}
        className={classNames(styles.caption, styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Micro = forwardRef(
  ({ as: Component = "p", children, className, fontWeight, ...rest }, ref) => {
    return (
      <Component
        {...rest}
        className={classNames(styles.micro, styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Link = forwardRef(
  (
    {
      as: Component = RouterLink,
      children,
      className,
      color = "link",
      href,
      fontWeight,
      ...rest
    },
    ref
  ) => {
    let externalLinkProps;

    if (href) {
      externalLinkProps = {
        target: "_blank",
        rel: "noreferrer noopener",
      };
    }

    return (
      <Component
        {...externalLinkProps}
        {...rest}
        className={classNames(styles[color], styles[fontWeight], className)}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);
