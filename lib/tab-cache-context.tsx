import { createContext, useContext, useState, ReactNode } from 'react';

interface TabCacheState {
  hasLoadedShare: boolean;
  hasLoadedRequest: boolean;
  markShareLoaded: () => void;
  markRequestLoaded: () => void;
}

const TabCacheContext = createContext<TabCacheState | null>(null);

export function TabCacheProvider({ children }: { children: ReactNode }) {
  const [hasLoadedShare, setHasLoadedShare] = useState(false);
  const [hasLoadedRequest, setHasLoadedRequest] = useState(false);

  return (
    <TabCacheContext.Provider
      value={{
        hasLoadedShare,
        hasLoadedRequest,
        markShareLoaded: () => setHasLoadedShare(true),
        markRequestLoaded: () => setHasLoadedRequest(true),
      }}
    >
      {children}
    </TabCacheContext.Provider>
  );
}

export function useTabCache() {
  const context = useContext(TabCacheContext);
  if (!context) {
    throw new Error('useTabCache must be used within TabCacheProvider');
  }
  return context;
}
