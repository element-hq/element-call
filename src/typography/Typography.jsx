import React, { forwardRef } from "react";
import classNames from "classnames";
import { Link as RouterLink } from "react-router-dom";
import styles from "./Typography.module.css";

export const Headline = forwardRef(
  (
    {
      as: Component = "h1",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    return (
      <Component
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Title = forwardRef(
  (
    {
      as: Component = "h2",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    return (
      <Component
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Subtitle = forwardRef(
  (
    {
      as: Component = "h3",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    return (
      <Component
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Body = forwardRef(
  (
    {
      as: Component = "p",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    return (
      <Component
        {...rest}
        className={classNames(
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Caption = forwardRef(
  (
    {
      as: Component = "p",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    return (
      <Component
        {...rest}
        className={classNames(
          styles.caption,
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);

export const Micro = forwardRef(
  (
    {
      as: Component = "p",
      children,
      className,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    return (
      <Component
        {...rest}
        className={classNames(
          styles.micro,
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
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
      as,
      children,
      className,
      color = "link",
      href,
      to,
      fontWeight,
      overflowEllipsis,
      ...rest
    },
    ref
  ) => {
    const Component = as || (to ? RouterLink : "a");
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
        to={to}
        className={classNames(
          styles[color],
          styles[fontWeight],
          { [styles.overflowEllipsis]: overflowEllipsis },
          className
        )}
        ref={ref}
      >
        {children}
      </Component>
    );
  }
);
