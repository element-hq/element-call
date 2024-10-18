/*
Copyright 2024 Milton Moura <miltonmoura@gmail.com>

SPDX-License-Identifier: AGPL-3.0-only
Please see LICENSE in the repository root for full details.
*/

import React, { createContext, useContext, useState, ReactNode } from "react";

interface ReactionsContextType {
  raisedHands: string[];
  setRaisedHands: React.Dispatch<React.SetStateAction<string[]>>;
  supportsReactions: boolean;
  setSupportsReactions: React.Dispatch<React.SetStateAction<boolean>>;
}

const ReactionsContext = createContext<ReactionsContextType | undefined>(
  undefined,
);

export const useReactions = (): ReactionsContextType => {
  const context = useContext(ReactionsContext);
  if (!context) {
    throw new Error("useReactions must be used within a ReactionsProvider");
  }
  return context;
};

export const ReactionsProvider = ({
  children,
}: {
  children: ReactNode;
}): JSX.Element => {
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [supportsReactions, setSupportsReactions] = useState<boolean>(true);

  return (
    <ReactionsContext.Provider
      value={{
        raisedHands,
        setRaisedHands,
        supportsReactions,
        setSupportsReactions,
      }}
    >
      {children}
    </ReactionsContext.Provider>
  );
};
