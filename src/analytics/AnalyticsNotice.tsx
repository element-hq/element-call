import { FC } from "react";
import { Trans } from "react-i18next";

import { Link } from "../typography/Typography";

export const AnalyticsNotice: FC = () => (
  <Trans>
    By participating in this beta, you consent to the collection of anonymous
    data, which we use to improve the product. You can find more information
    about which data we track in our{" "}
    <Link href="https://element.io/privacy">Privacy Policy</Link> and our{" "}
    <Link href="https://element.io/cookie-policy">Cookie Policy</Link>.
  </Trans>
);
