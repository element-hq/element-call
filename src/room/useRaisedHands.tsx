/*
Copyright 2024 Milton Moura <miltonmoura@gmail.com>

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
