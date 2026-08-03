/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type ComponentProps, type FC, type MouseEvent } from "react";
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

type Props = Omit<ComponentProps<typeof CpdLink>, "href" | "onClick"> & {
  to: LinkProps["to"];
  state?: unknown;
};

/**
 * A version of Compound's link component that integrates with our router setup.
 * This is only for app-internal links.
 */
export const Link: FC<Props> = ({ ref, to, state, ...props }) => {
  const [path, onClick] = useLink(to, state);
  return <CpdLink ref={ref} {...props} href={path} onClick={onClick} />;
};

/**
 * A link to an external web page, made to fit into blocks of text more subtly
 * than the normal Compound link component.
 */
export const ExternalLink: FC<ComponentProps<"a">> = ({
  ref,
  className,
  children,
  ...props
}) => {
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
};
