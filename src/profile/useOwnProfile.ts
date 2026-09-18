/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from "react";

import {
  type OwnProfile,
  type ProfileDriver,
} from "../driver/ElementCallMatrixClientDriver";
import { useMatrixDrivers } from "../driver/MatrixDriverContext";

/** The user's own display name and avatar from a profile driver, kept current. */
export function useOwnProfileFrom(profile: ProfileDriver): OwnProfile {
  const [own, setOwn] = useState(() => profile.getOwnProfile());
  useEffect(() => {
    setOwn(profile.getOwnProfile());
    return profile.subscribeOwnProfile(setOwn);
  }, [profile]);
  return own;
}

/**
 * {@link useOwnProfileFrom} over the client driver the host provided. The
 * read-only counterpart of `useProfile(client)`, for the call tree; editing
 * stays with the profile settings, which a host may not offer.
 */
export function useOwnProfile(): OwnProfile {
  return useOwnProfileFrom(useMatrixDrivers().clientDriver);
}
