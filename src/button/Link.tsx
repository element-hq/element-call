/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type MouseEvent,
} from "react";
import { Link as CpdLink } from "@vector-im/compound-web";
import { type LinkProps, useHref, useLinkClickHandler } from "react-router-dom";
import classNames from "classnames";

import styles from "./Link.module.css";

export function useLink(
  to: LinkProps["to"],
  state?: unknown,
): [string, (e: MouseEvent<HTMLAnchorElement>) => void] {
  const href = useHref(to);
  const onClick = useLinkClickHandler(to, { state });

  return [href, onClick];
}

type Props = Omit<
  ComponentPropsWithoutRef<typeof CpdLink>,
  "href" | "onClick"
> & { to: LinkProps["to"]; state?: unknown };

/**
 * A version of Compound's link component that integrates with our router setup.
 * This is only for app-internal links.
 */
export const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { to, state, ...props },
  ref,
) {
  const [path, onClick] = useLink(to, state);
  return <CpdLink ref={ref} {...props} href={path} onClick={onClick} />;
});

/**
 * A link to an external web page, made to fit into blocks of text more subtly
 * than the normal Compound link component.
 */
export const ExternalLink = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<"a">
>(function ExternalLink({ className, children, ...props }, ref) {
  return (
    <a
      ref={ref}
      className={classNames(className, styles.external)}
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    >
      {children}
    </a>
  );
});
