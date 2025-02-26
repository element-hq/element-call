/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  HostIcon,
  PopOutIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import { ErrorView } from "./ErrorView";
import { type ElementCallError, type ErrorCode } from "./utils/ec-errors.ts";

/**
 * An error consisting of a terse message to be logged to the console and a
 * richer message to be shown to the user, as a full-screen page.
 */
export class RichError extends Error {
  public constructor(
    message: string,
    /**
     * The pretty, more helpful message to be shown on the error screen.
     */
    public readonly richMessage: ReactNode,
  ) {
    super(message);
  }
}

const OpenElsewhere: FC = () => {
  const { t } = useTranslation();

  return (
    <ErrorView Icon={PopOutIcon} title={t("error.open_elsewhere")}>
      <p>
        {t("error.open_elsewhere_description", {
          brand: import.meta.env.VITE_PRODUCT_NAME || "Element Call",
        })}
      </p>
    </ErrorView>
  );
};

export class OpenElsewhereError extends RichError {
  public constructor() {
    super("App opened in another tab", <OpenElsewhere />);
  }
}

const InsufficientCapacity: FC = () => {
  const { t } = useTranslation();

  return (
    <ErrorView Icon={HostIcon} title={t("error.insufficient_capacity")}>
      <p>{t("error.insufficient_capacity_description")}</p>
    </ErrorView>
  );
};

export class InsufficientCapacityError extends RichError {
  public constructor() {
    super("Insufficient server capacity", <InsufficientCapacity />);
  }
}

type ECErrorProps = {
  errorCode: ErrorCode;
};

const GenericECError: FC<{ errorCode: ErrorCode }> = ({
  errorCode,
}: ECErrorProps) => {
  const { t } = useTranslation();

  return (
    <ErrorView Icon={HostIcon} title={t("error.generic")}>
      <p>
        <Trans
          i18nKey="error.unexpected_ec_error"
          components={[<b />, <code />]}
          values={{ errorCode }}
        />
      </p>
    </ErrorView>
  );
};

export class ElementCallRichError extends RichError {
  public ecError: ElementCallError;
  public constructor(ecError: ElementCallError) {
    super(ecError.message, <GenericECError errorCode={ecError.code} />);
    this.ecError = ecError;
  }
}
