/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

export enum E2eeType {
  NONE = 0,
  PER_PARTICIPANT = 1,
  SHARED_KEY = 2,
}

export interface Unencrypted {
  kind: E2eeType.NONE;
}

export interface SharedSecret {
  kind: E2eeType.SHARED_KEY;
  secret: string;
}

export interface PerParticipantE2EE {
  kind: E2eeType.PER_PARTICIPANT;
}

export type EncryptionSystem = Unencrypted | SharedSecret | PerParticipantE2EE;
