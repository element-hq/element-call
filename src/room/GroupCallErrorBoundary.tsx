/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { ErrorBoundary, type FallbackRender } from "@sentry/react";
import {
  type ComponentType,
  type FC,
  type ReactElement,
  type ReactNode,
  type SVGAttributes,
  useCallback,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ErrorSolidIcon,
  HostIcon,
  OfflineIcon,
  WebBrowserIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { Button } from "@vector-im/compound-web";
import { logger } from "matrix-js-sdk/lib/logger";

import {
  ConnectionLostError,
  ElementCallError,
  ErrorCategory,
  ErrorCode,
  UnknownCallError,
} from "../utils/errors.ts";
import { FullScreenView } from "../FullScreenView.tsx";
import { ErrorView } from "../ErrorView.tsx";
import { type WidgetHelpers } from "../widget.ts";

export type CallErrorRecoveryAction = "reconnect"; // | "retry" ;

export type RecoveryActionHandler = (
  action: CallErrorRecoveryAction,
) => Promise<void>;

interface ErrorPageProps {
  error: ElementCallError;
  recoveryActionHandler: RecoveryActionHandler;
  resetError: () => void;
  widget: WidgetHelpers | null;
}

const ErrorPage: FC<ErrorPageProps> = ({
  error,
  recoveryActionHandler,
  widget,
}: ErrorPageProps): ReactElement => {
  const { t } = useTranslation();
  logger.error("Error boundary caught:", error);
  let icon: ComponentType<SVGAttributes<SVGElement>>;
  switch (error.category) {
    case ErrorCategory.CONFIGURATION_ISSUE:
      icon = HostIcon;
      break;
    case ErrorCategory.NETWORK_CONNECTIVITY:
      icon = OfflineIcon;
      break;
    case ErrorCategory.CLIENT_CONFIGURATION:
      icon = WebBrowserIcon;
      break;
    default:
      icon = ErrorSolidIcon;
  }

  const actions: { label: string; onClick: () => void }[] = [];
  if (error instanceof ConnectionLostError) {
    actions.push({
      label: t("call_ended_view.reconnect_button"),
      onClick: () => void recoveryActionHandler("reconnect"),
    });
  }

  return (
    <FullScreenView>
      <ErrorView
        Icon={icon}
        title={error.localisedTitle}
        rageshake={error.code == ErrorCode.UNKNOWN_ERROR}
        widget={widget}
      >
        <p>
          {error.localisedMessage ?? (
            <Trans
              i18nKey="error.unexpected_ec_error"
              components={[<b />, <code />]}
              values={{ errorCode: error.code }}
            />
          )}
        </p>
        {actions &&
          actions.map((action, index) => (
            <Button
              kind="secondary"
              onClick={action.onClick}
              key={`action${index}`}
            >
              {action.label}
            </Button>
          ))}
      </ErrorView>
    </FullScreenView>
  );
};

interface BoundaryProps {
  children: ReactNode | (() => ReactNode);
  recoveryActionHandler: RecoveryActionHandler;
  onError?: (error: unknown) => void;
  widget: WidgetHelpers | null;
}

export const GroupCallErrorBoundary = ({
  recoveryActionHandler,
  onError,
  children,
  widget,
}: BoundaryProps): ReactElement => {
  const fallbackRenderer: FallbackRender = useCallback(
    ({ error, resetError }): ReactElement => {
      const callError =
        error instanceof ElementCallError
          ? error
          : new UnknownCallError(error instanceof Error ? error : new Error());
      return (
        <ErrorPage
          widget={widget ?? null}
          error={callError}
          resetError={resetError}
          recoveryActionHandler={async (action: CallErrorRecoveryAction) => {
            await recoveryActionHandler(action);
            resetError();
          }}
        />
      );
    },
    [recoveryActionHandler, widget],
  );

  return (
    <ErrorBoundary
      fallback={fallbackRenderer}
      onError={(error) => onError?.(error)}
      children={children}
    />
  );
};
