import { createContext, useContext, useState } from 'react';

const GapThresholdContext = createContext<{
  threshold: number;
  setThreshold: (v: number) => void;
}>({ threshold: 50, setThreshold: () => {} });

export function GapThresholdProvider({ children }: { children: React.ReactNode }) {
  const [threshold, setThreshold] = useState(50);
  return (
    <GapThresholdContext.Provider value={{ threshold, setThreshold }}>
      {children}
    </GapThresholdContext.Provider>
  );
}

export function useGapThreshold() {
  return useContext(GapThresholdContext);
}
