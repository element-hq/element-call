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

import { Trans } from "react-i18next";

import { Banner } from "./Banner";
import styles from "./E2EEBanner.module.css";
import { ReactComponent as LockOffIcon } from "./icons/LockOff.svg";
import { useEnableE2EE } from "./e2ee/e2eeHooks";

export const E2EEBanner = () => {
  const e2eeEnabled = useEnableE2EE();
  if (e2eeEnabled) return null;

  return (
    <Banner>
      <div className={styles.e2eeBanner}>
        <LockOffIcon width={24} height={24} />
        <Trans>
          Element Call is temporarily not end-to-end encrypted while we test
          scalability.
        </Trans>
      </div>
    </Banner>
  );
};
