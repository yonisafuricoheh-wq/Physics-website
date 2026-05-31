import { createContext, useContext } from 'react';

export const SimulationContext = createContext(null);

export function useSimulationContext() {
  return useContext(SimulationContext);
}
