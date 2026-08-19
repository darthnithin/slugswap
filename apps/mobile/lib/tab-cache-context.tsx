import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DonorImpact, RequesterPoolStatus } from './api';

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
  requesterWeeklyLimit: number;
  requesterWeekEnd: string | null;
  requesterDaysUntilReset: number;
  requesterPoolStatus: RequesterPoolStatus;
}

interface TabCacheState {
  shareSnapshot: ShareTabSnapshot | null;
  setShareSnapshot: (snapshot: ShareTabSnapshot) => void;
}

const TabCacheContext = createContext<TabCacheState | null>(null);

export function TabCacheProvider({ children }: { children: ReactNode }) {
  const [shareSnapshot, setShareSnapshotState] = useState<ShareTabSnapshot | null>(null);

  const setShareSnapshot = useCallback((snapshot: ShareTabSnapshot) => {
    setShareSnapshotState(snapshot);
  }, []);

  const value = useMemo(
    () => ({
      shareSnapshot,
      setShareSnapshot,
    }),
    [shareSnapshot, setShareSnapshot]
  );

  return (
    <TabCacheContext.Provider value={value}>
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
