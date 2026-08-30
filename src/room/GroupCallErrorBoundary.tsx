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
  describeErrorChain,
  ElementCallError,
  ErrorCategory,
  ErrorCode,
  UnknownCallError,
} from "../utils/errors.ts";
import { FullScreenView } from "../FullScreenView.tsx";
import { ErrorView } from "../ErrorView.tsx";
import { type WidgetHelpers } from "../widget.ts";
import styles from "../ErrorView.module.css";

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

  // Show the whole cause chain rather than just a `MatrixError` cause: the
  // request that actually failed is often several wrappers deep, and errors
  // that are not `MatrixError`s (widget API timeouts, LiveKit connection
  // errors, ...) used to leave this section empty entirely. A chain of length
  // one is just the error we already render above, so keep it hidden.
  const errorChain = describeErrorChain(error);
  const technicalDetails = errorChain.length > 1 ? errorChain.join("\n") : null;

  return (
    <FullScreenView>
      <ErrorView
        Icon={icon}
        title={error.localisedTitle}
        rageshake={error.code == ErrorCode.UNKNOWN_ERROR}
        widget={widget}
      >
        <p>
          {error.localisedMessageKey ? (
            <Trans
              // @ts-expect-error - Dynamic i18nKey from error object
              i18nKey={error.localisedMessageKey}
              values={error.localisedMessageValues}
              components={[
                <a
                  href={String(error.localisedMessageValues?.linkUrl || "#")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {/* Content injected by Trans component */}
                </a>,
                <b />,
                <code />,
              ]}
            />
          ) : error.localisedMessage ? (
            error.localisedMessage
          ) : (
            <Trans
              i18nKey="error.unexpected_ec_error"
              components={[<b />, <code />]}
              values={{ errorCode: error.code }}
            />
          )}
        </p>
        {technicalDetails ? (
          <details className={styles.technicalDetails}>
            <summary className={styles.technicalDetailsSummary}>
              {t("technical_details")}
            </summary>
            <pre className={styles.technicalDetailsPre}>{technicalDetails}</pre>
          </details>
        ) : null}
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
          : new UnknownCallError(
              error instanceof Error
                ? error
                : new Error(
                    `Non-error value thrown during the call: ${String(error)}`,
                  ),
            );
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
