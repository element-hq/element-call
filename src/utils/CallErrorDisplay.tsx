/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type ComponentType,
  type FC,
  type ReactElement,
  type ReactNode,
  type SVGAttributes,
  useEffect,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react";
import {
  ErrorIcon,
  HostIcon,
  OfflineIcon,
  WebBrowserIcon,
} from "@vector-im/compound-design-tokens/assets/web/icons";
import { logger } from "matrix-js-sdk/src/logger";

import {
  type ErrorAction,
  useCallErrorDisplay,
} from "./useCallErrorDisplay.tsx";
import { ErrorView } from "../ErrorView.tsx";
import { FullScreenView } from "../FullScreenView.tsx";
import { type ElementCallError, ErrorCategory, ErrorCode } from "./errors.ts";

interface ErrorPageProps {
  error: ElementCallError;
  actions?: ErrorAction[];
}

const ErrorPage: FC<ErrorPageProps> = ({
  error,
  actions,
}: ErrorPageProps): ReactElement => {
  const { t } = useTranslation();
  const { setCallErrorState } = useCallErrorDisplay();

  useEffect(() => {
    if (error) {
      logger.error(error);
      Sentry.captureException(error);
    }
  }, [error]);

  let title: string;
  let icon: ComponentType<SVGAttributes<SVGElement>>;
  switch (error.category) {
    case ErrorCategory.CONFIGURATION_ISSUE:
      title = t("error.call_is_not_supported");
      icon = HostIcon;
      break;
    case ErrorCategory.NETWORK_CONNECTIVITY:
      title = t("error.connection_lost");
      icon = OfflineIcon;
      break;
    case ErrorCategory.CLIENT_CONFIGURATION:
      title = t("error.e2ee_unsupported"); // not the best name for that, but currently the only error in this category
      icon = WebBrowserIcon;
      break;
    default:
      title = t("error.generic");
      icon = ErrorIcon;
  }

  const actionCallbacks = actions?.map((action) => {
    return (): void => {
      setCallErrorState(null);
      action.onClick();
    };
  });
  return (
    <FullScreenView>
      <ErrorView
        Icon={icon}
        title={title}
        rageshake={error.code === ErrorCode.UNKNOWN_ERROR}
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
            <button onClick={actionCallbacks![index]} key={`action${index}`}>
              {t(action.labelKey)}
            </button>
          ))}
      </ErrorView>
    </FullScreenView>
  );
};

/**
 * Display the call error if there is one.
 *
 * Should be surrounded by a `CallErrorStateProvider`.
 *
 * Any component in the hierarchy can access the call error context using `useCallErrorDisplay`.
 * If the error is set then the `ErrorPage` will be displayed.
 * A component can set up custom buttons/actions that will be displayed on the error page.
 * ```
 * const { setCallErrorState } = useCallErrorDisplay();
 * // ...
 *     setCallErrorState({
 *          reason: new ConnectionLostError(),
 *          actions: [
 *                {
 *                 labelKey: "call_ended_view.reconnect_button",
 *                 onClick: reconnect,
 *               },
 *          ]
 *     }
 * // ...
 *
 * ```
 * @constructor
 */
export const CallErrorDisplay: () => ReactNode = () => {
  const { callErrorState } = useCallErrorDisplay();

  if (callErrorState) {
    return (
      <ErrorPage
        error={callErrorState.cause}
        actions={callErrorState.actions}
      />
    );
  }

  return <></>;
};
