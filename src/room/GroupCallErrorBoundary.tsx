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
  ErrorIcon,
  HostIcon,
  OfflineIcon,
  WebBrowserIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";

import {
  ConnectionLostError,
  ElementCallError,
  ErrorCategory,
  ErrorCode,
  UnknownCallError,
} from "../utils/errors.ts";
import { FullScreenView } from "../FullScreenView.tsx";
import { ErrorView } from "../ErrorView.tsx";

export type CallErrorRecoveryAction = "reconnect"; // | "retry" ;

export type RecoveryActionHandler = (action: CallErrorRecoveryAction) => void;

interface ErrorPageProps {
  error: ElementCallError;
  recoveryActionHandler?: RecoveryActionHandler;
  resetError: () => void;
}

const ErrorPage: FC<ErrorPageProps> = ({
  error,
  recoveryActionHandler,
}: ErrorPageProps): ReactElement => {
  const { t } = useTranslation();

  // let title: string;
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
      icon = ErrorIcon;
  }

  const actions: { label: string; onClick: () => void }[] = [];
  if (error instanceof ConnectionLostError) {
    actions.push({
      label: t("call_ended_view.reconnect_button"),
      onClick: () => recoveryActionHandler?.("reconnect"),
    });
  }

  return (
    <FullScreenView>
      <ErrorView
        Icon={icon}
        title={error.localisedTitle}
        rageshake={error.code == ErrorCode.UNKNOWN_ERROR}
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
            <button onClick={action.onClick} key={`action${index}`}>
              {action.label}
            </button>
          ))}
      </ErrorView>
    </FullScreenView>
  );
};

interface BoundaryProps {
  children: ReactNode | (() => ReactNode);
  recoveryActionHandler?: RecoveryActionHandler;
  onError?: (error: unknown) => void;
}

/**
 * An ErrorBoundary component that handles ElementCalls errors that can occur during a group call.
 * It is based on the sentry ErrorBoundary component, that will log the error to sentry.
 *
 * The error fallback will show an error page with:
 * - a description of the error
 * - a button to go back the home screen
 * - optional call-to-action buttons (ex: reconnect for connection lost)
 * - A rageshake button for unknown errors
 *
 * For async errors the `useCallErrorBoundary` hook should be used to show the error page
 * ```
 *   const { showGroupCallErrorBoundary } = useCallErrorBoundary();
 *   ... some async code
 *       catch(error) {
 *        showGroupCallErrorBoundary(error);
 *       }
 *   ...
 * ```
 * @param recoveryActionHandler
 * @param onError
 * @param children
 * @constructor
 */
export const GroupCallErrorBoundary = ({
  recoveryActionHandler,
  onError,
  children,
}: BoundaryProps): ReactElement => {
  const fallbackRenderer: FallbackRender = useCallback(
    ({ error, resetError }): ReactElement => {
      const callError =
        error instanceof ElementCallError
          ? error
          : new UnknownCallError(error instanceof Error ? error : new Error());
      return (
        <ErrorPage
          error={callError}
          resetError={resetError}
          recoveryActionHandler={(action: CallErrorRecoveryAction) => {
            resetError();
            recoveryActionHandler?.(action);
          }}
        />
      );
    },
    [recoveryActionHandler],
  );

  return (
    <ErrorBoundary
      fallback={fallbackRenderer}
      onError={(error) => onError?.(error)}
      children={children}
    />
  );
};
