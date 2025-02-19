/*
Copyright 2023, 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC } from "react";
import { Trans } from "react-i18next";

import { ExternalLink } from "../button/Link";

export const AnalyticsNotice: FC = () => (
  <Trans i18nKey="analytics_notice">
    By participating in this beta, you consent to the collection of anonymous
    data, which we use to improve the product. You can find more information
    about which data we track in our{" "}
    <ExternalLink href="https://element.io/privacy">
      Privacy Policy
    </ExternalLink>{" "}
    and our{" "}
    <ExternalLink href="https://element.io/cookie-policy">
      Cookie Policy
    </ExternalLink>
    .
  </Trans>
);
