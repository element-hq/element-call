/*
Copyright 2023 New Vector Ltd

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

import { FC } from "react";
import { Trans } from "react-i18next";

import { Link } from "../typography/Typography";

export const AnalyticsNotice: FC = () => (
  <Trans i18nKey="analytics_notice">
    By participating in this beta, you consent to the collection of anonymous
    data, which we use to improve the product. You can find more information
    about which data we track in our{" "}
    <Link href="https://element.io/privacy">Privacy Policy</Link> and our{" "}
    <Link href="https://element.io/cookie-policy">Cookie Policy</Link>.
  </Trans>
);
