import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { DonorImpact, RequesterPoolStatus } from './api';
import { syncDiningMenuWindow } from './dining-menu-cache';

function todayInPacific(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

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

export function TabCacheProvider({
  children,
  sessionUserId,
}: {
  children: ReactNode;
  sessionUserId: string | null;
}) {
  const [cachedShareSnapshot, setShareSnapshotState] = useState<ShareTabSnapshot | null>(null);
  const shareSnapshot =
    sessionUserId !== null && cachedShareSnapshot?.userId === sessionUserId
      ? cachedShareSnapshot
      : null;

  useEffect(() => {
    const warmDiningMenus = () => {
      const windowStart = todayInPacific();
      void syncDiningMenuWindow(windowStart).catch((error) => {
        console.warn('Failed to warm weekly dining menus:', error);
      });
    };

    warmDiningMenus();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') warmDiningMenus();
    });

    return () => appStateSubscription.remove();
  }, []);

  useEffect(() => {
    setShareSnapshotState((snapshot) =>
      snapshot && snapshot.userId !== sessionUserId ? null : snapshot
    );
  }, [sessionUserId]);

  const setShareSnapshot = useCallback((snapshot: ShareTabSnapshot) => {
    if (!sessionUserId || snapshot.userId !== sessionUserId) return;
    setShareSnapshotState(snapshot);
  }, [sessionUserId]);

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
