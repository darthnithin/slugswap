import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import type { DonorImpact } from './api';

export interface GetAccountBalance {
  id: string;
  accountDisplayName: string;
  balance: number | null;
}

export interface ShareTabSnapshot {
  userId: string | null;
  userEmail: string | null;
  weeklyAmount: string;
  isActive: boolean;
  impact: DonorImpact;
  isGetLinked: boolean;
  getLinkedAt: string | null;
  getAccounts: GetAccountBalance[];
}

interface TabCacheState {
  hasLoadedShare: boolean;
  hasLoadedRequest: boolean;
  shareSnapshot: ShareTabSnapshot | null;
  markShareLoaded: () => void;
  markRequestLoaded: () => void;
  setShareSnapshot: (snapshot: ShareTabSnapshot) => void;
}

const TabCacheContext = createContext<TabCacheState | null>(null);

export function TabCacheProvider({ children }: { children: ReactNode }) {
  const [hasLoadedShare, setHasLoadedShare] = useState(false);
  const [hasLoadedRequest, setHasLoadedRequest] = useState(false);
  const [shareSnapshot, setShareSnapshotState] = useState<ShareTabSnapshot | null>(null);

  const markShareLoaded = useCallback(() => {
    setHasLoadedShare(true);
  }, []);

  const markRequestLoaded = useCallback(() => {
    setHasLoadedRequest(true);
  }, []);

  const setShareSnapshot = useCallback((snapshot: ShareTabSnapshot) => {
    setShareSnapshotState(snapshot);
    setHasLoadedShare(true);
  }, []);

  const value = useMemo(
    () => ({
      hasLoadedShare,
      hasLoadedRequest,
      shareSnapshot,
      markShareLoaded,
      markRequestLoaded,
      setShareSnapshot,
    }),
    [
      hasLoadedShare,
      hasLoadedRequest,
      shareSnapshot,
      markShareLoaded,
      markRequestLoaded,
      setShareSnapshot,
    ]
  );

  return (
    <TabCacheContext.Provider
      value={value}
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
