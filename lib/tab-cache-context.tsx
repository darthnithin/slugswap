import { createContext, useContext, useState, ReactNode } from 'react';
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

  return (
    <TabCacheContext.Provider
      value={{
        hasLoadedShare,
        hasLoadedRequest,
        shareSnapshot,
        markShareLoaded: () => setHasLoadedShare(true),
        markRequestLoaded: () => setHasLoadedRequest(true),
        setShareSnapshot: (snapshot) => {
          setShareSnapshotState(snapshot);
          setHasLoadedShare(true);
        },
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
