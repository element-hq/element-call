/*
Copyright 2024 Milton Moura <miltonmoura@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import React, { createContext, useContext, useState, ReactNode } from "react";

interface RaisedHandsContextType {
  raisedHands: string[];
  setRaisedHands: React.Dispatch<React.SetStateAction<string[]>>;
}

const RaisedHandsContext = createContext<RaisedHandsContextType | undefined>(
  undefined,
);

export const useRaisedHands = (): RaisedHandsContextType => {
  const context = useContext(RaisedHandsContext);
  if (!context) {
    throw new Error("useRaisedHands must be used within a RaisedHandsProvider");
  }
  return context;
};

export const RaisedHandsProvider = ({
  children,
}: {
  children: ReactNode;
}): JSX.Element => {
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  return (
    <RaisedHandsContext.Provider value={{ raisedHands, setRaisedHands }}>
      {children}
    </RaisedHandsContext.Provider>
  );
};
