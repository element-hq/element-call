/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  useMemo,
  type FC,
  type CSSProperties,
  useState,
  useEffect,
} from "react";
import { Avatar as CompoundAvatar } from "@vector-im/compound-web";
import { type MatrixClient } from "matrix-js-sdk";

import { ClientState, useClientState } from "./ClientContext";
import { widget } from "./widget";
import { WidgetApi } from "matrix-widget-api";

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

export interface Props {
  id: string;
  name: string;
  className?: string;
  src?: string;
  size?: Size | number;
  style?: CSSProperties;
}

export function getAvatarUrl(
  client: MatrixClient,
  mxcUrl: string | null,
  avatarSize = 96,
): string | null {
  const width = Math.floor(avatarSize * window.devicePixelRatio);
  const height = Math.floor(avatarSize * window.devicePixelRatio);
  // scale is more suitable for larger sizes
  const resizeMethod = avatarSize <= 96 ? "crop" : "scale";
  return mxcUrl
    ? client.mxcUrlToHttp(
        mxcUrl,
        width,
        height,
        resizeMethod,
        false,
        true,
        true,
      )
    : null;
}

export const Avatar: FC<Props> = ({
  className,
  id,
  name,
  src,
  size = Size.MD,
  style,
  ...props
}) => {
  const clientState = useClientState();

  const sizePx = useMemo(
    () =>
      Object.values(Size).includes(size as Size)
        ? sizes.get(size as Size)
        : (size as number),
    [size],
  );

  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!src) {
      setAvatarUrl(undefined);
      return;
    }

    let objectUrl: string | undefined;

    getAvatarFromServer(clientState, src, sizePx) // Try to download directly from the mxc://
      .catch((ex) => {
        return getAvatarFromWidget(widget?.api, src); // Fallback to trying to use the MSC4039 Widget API
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch((ex) => {
        setAvatarUrl(undefined);
      });

    return (): void => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [clientState, src, sizePx]);

  return (
    <CompoundAvatar
      className={className}
      id={id}
      name={name}
      size={`${sizePx}px`}
      src={avatarUrl}
      style={style}
      {...props}
    />
  );
};

async function getAvatarFromServer(
  clientState: ClientState | undefined,
  src: string,
  sizePx: number | undefined,
): Promise<Blob> {
  if (clientState?.state !== "valid") {
    throw new Error("Client state must be valid");
  }
  if (!sizePx) {
    throw new Error("size must be supplied");
  }

  const { authenticated, supportedFeatures } = clientState;
  const client = authenticated?.client;
  if (!client) {
    throw new Error("Client must be supplied");
  }
  if (!supportedFeatures.thumbnails) {
    throw new Error("Thumbnails are not supported");
  }

  const httpSrc = getAvatarUrl(client, src, sizePx);
  if (!httpSrc) {
    throw new Error("Failed to get http avatar URL");
  }

  const token = client.getAccessToken();
  if (!token) {
    throw new Error("Failed to get access token");
  }

  const request = await fetch(httpSrc, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const blob = await request.blob();

  return blob;
}

async function getAvatarFromWidget(
  api: WidgetApi | undefined,
  src: string,
): Promise<Blob> {
  if (!api) {
    throw new Error("No widget api given");
  }

  const response = await api.downloadFile(src);
  const file = response.file;

  // element-web sends a Blob, and the MSC4039 is considering changing the spec to strictly Blob, so only handling that
  if (!(file instanceof Blob)) {
    throw new Error("Downloaded file is not a Blob");
  }

  return file;
}
