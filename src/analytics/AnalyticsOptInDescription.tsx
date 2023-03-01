import { t } from "i18next";
import React from "react";

import { Link } from "../typography/Typography";

export const optInDescription: () => JSX.Element = () => {
  return (
    <>
      <>
        {t(
          "By ticking this box you consent to the collection of anonymous data, which we use to improve your experience. You can find more information about which data we track in our "
        )}
      </>
      <Link color="primary" href="https://element.io/privacy">
        <>{t("Privacy Policy")}</>
      </Link>
      .
    </>
  );
};
