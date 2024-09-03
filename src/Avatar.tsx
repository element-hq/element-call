/*
Copyright 2022 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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
