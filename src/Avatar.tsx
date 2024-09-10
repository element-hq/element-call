/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import { useMemo, FC } from "react";
import { Avatar as CompoundAvatar } from "@vector-im/compound-web";

import { getAvatarUrl } from "./utils/matrix";
import { useClient } from "./ClientContext";

export enum Size {
  XS = "xs",
  SM = "sm",
  MD = "md",
  LG = "lg",
  XL = "xl",
}

export const sizes = new Map([
  [Size.XS, 22],
  [Size.SM, 32],
  [Size.MD, 36],
  [Size.LG, 42],
  [Size.XL, 90],
]);

interface Props {
  id: string;
  name: string;
  className?: string;
  src?: string;
  size?: Size | number;
}

export const Avatar: FC<Props> = ({
  className,
  id,
  name,
  src,
  size = Size.MD,
}) => {
  const { client } = useClient();

  const sizePx = useMemo(
    () =>
      Object.values(Size).includes(size as Size)
        ? sizes.get(size as Size)
        : (size as number),
    [size],
  );

  const resolvedSrc = useMemo(() => {
    if (!client || !src || !sizePx) return undefined;
    return src.startsWith("mxc://") ? getAvatarUrl(client, src, sizePx) : src;
  }, [client, src, sizePx]);

  return (
    <CompoundAvatar
      className={className}
      id={id}
      name={name}
      size={`${sizePx}px`}
      src={resolvedSrc}
    />
  );
};
