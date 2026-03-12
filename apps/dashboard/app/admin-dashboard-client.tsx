"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiQuerySection } from "./api-query-section";

type NavSection = "overview" | "pool" | "claims" | "config" | "donors" | "api" | "users";
type ClaimStatus = "redeemed" | "pending" | "active" | "expired";

type ClaimAggregate = {
  count: number;
  amount: number;
};

type ChartGranularity = "weekly" | "daily";

type DonorSelectionPolicy =
  | "round_robin"
  | "weighted_round_robin"
  | "least_utilized"
  | "highest_balance";

type PoolConfig = {
  defaultWeeklyAllowance: number;
  defaultClaimAmount: number;
  codeExpiryMinutes: number;
  poolCalculationMethod: "equal" | "proportional";
  maxClaimsPerDay: number;
  minDonationAmount: number;
  maxDonationAmount: number;
  donorSelectionPolicy: DonorSelectionPolicy;
  iosRequiredVersion: string;
  androidRequiredVersion: string;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
};

type NumericConfigField =
  | "defaultWeeklyAllowance"
  | "defaultClaimAmount"
  | "codeExpiryMinutes"
  | "maxClaimsPerDay"
  | "minDonationAmount"
  | "maxDonationAmount";

type TextConfigField =
  | "iosRequiredVersion"
  | "androidRequiredVersion"
  | "iosStoreUrl"
  | "androidStoreUrl";

type AdminStatsResponse = {
  timestamp: string;
  pool: {
    weekStart: string;
    weekEnd: string;
    totalAmount: number;
    allocatedAmount: number;
    remainingAmount: number;
    utilizationPct: number;
    isEstimated: boolean;
  };
  donors: {
    active: number;
    paused: number;
    total: number;
    uniqueUsers: number;
    weeklyInflow: number;
    avgWeeklyDonation: number;
  };
  claims: {
    thisWeek: {
      total: number;
      totalAmount: number;
      byStatus: Record<string, ClaimAggregate | undefined>;
      redemptionRate: number;
    };
    allTime: {
      total: number;
      totalAmount: number;
      redeemed: number;
      redeemedAmount: number;
    };
  };
  users: {
    total: number;
    uniqueRequesters: number;
    uniqueDonors: number;
    linkedGetAccounts: number;
    avgPointsPerRequesterThisWeek: number;
  };
  donorSelection: {
    policy: DonorSelectionPolicy;
    timezone: string;
    weekStart: string;
    weekEnd: string;
  };
  recentClaims: Array<{
    id: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    amount: number;
    status: string;
    createdAt: string;
    expiresAt: string;
  }>;
  topDonors: Array<{
    userId: string;
    name: string;
    email: string | null;
    amount: number;
    status: string;
    hasLinkedGet: boolean;
    trackedGetBalanceTotal: number | null;
    capAmount: number;
    redeemedThisWeek: number;
    reservedThisWeek: number;
    remainingThisWeek: number;
    capReached: boolean;
    utilizationRatio: number;
  }>;
  poolHistory: Array<{
    weekStart: string;
    weekEnd: string;
    totalAmount: number;
    allocatedAmount: number;
    remainingAmount: number;
  }>;
  dailyHistory: Array<{
    dayStart: string;
    dayLabel: string;
    redeemedAmount: number;
    remainingAmount: number;
  }>;
};

type AdminConfigResponse = {
  config: PoolConfig;
  updatedAt: string;
  message?: string;
};

type AdminUserBalanceResponse = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  };
  weekWindow: {
    timezone: string;
    weekStart: string;
    weekEnd: string;
  };
  getLinkStatus: {
    linked: boolean;
    linkedAt: string | null;
    accountsFetchError: string | null;
  };
  getBalance: Array<{ id: string; accountDisplayName: string; balance: number | null }> | null;
  trackedGetBalanceTotal: number;
  weeklyAllowance: {
    weeklyLimit: number;
    usedAmount: number;
    remainingAmount: number;
  } | null;
  requesterUsage: {
    allTimeClaimsCount: number;
    allTimeClaimsAmount: number;
    allTimeRedeemedCount: number;
    allTimeRedeemedAmount: number;
    thisWeekClaimsCount: number;
    thisWeekClaimsAmount: number;
    thisWeekRedeemedCount: number;
    thisWeekRedeemedAmount: number;
    activeClaimsCount: number;
  };
  donorUsage: {
    status: string;
    weeklyAmount: number;
    redeemedThisWeek: number;
    reservedThisWeek: number;
    remainingThisWeek: number;
    allTimeRedeemedAmount: number;
    allTimeRedeemedCount: number;
  } | null;
};

const SECTION_TITLES: Record<NavSection, string> = {
  overview: "Overview",
  pool: "Pool Health",
  claims: "Claims",
  config: "Configuration",
  donors: "Donors",
  api: "API Query",
  users: "User Management",
};

function formatNum(n: number | string | null | undefined): string {
  if (n === undefined || n === null) return "0";

  const num = Number(n);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (Number.isInteger(num)) {
    return num.toString();
  }
  return num.toFixed(1);
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function getInitials(name: string): string {
  if (!name || name === "Anonymous") return "?";
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "now";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDateTime(dateIso: string | null): string {
  if (!dateIso) return "—";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isClaimStatus(status: string): status is ClaimStatus {
  return ["redeemed", "pending", "active", "expired"].includes(status);
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Fall through to generic message.
  }
  return `Request failed (${response.status})`;
}

export default function DashboardHomePage() {
  const router = useRouter();
  const mainRef = useRef<HTMLElement | null>(null);
  const poolSectionRef = useRef<HTMLDivElement | null>(null);
  const configSectionRef = useRef<HTMLDivElement | null>(null);
  const donorsSectionRef = useRef<HTMLDivElement | null>(null);
  const apiSectionRef = useRef<HTMLDivElement | null>(null);
  const usersSectionRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedRef = useRef(false);

  const [statsData, setStatsData] = useState<AdminStatsResponse | null>(null);
  const [configData, setConfigData] = useState<AdminConfigResponse | null>(null);
  const [configDraft, setConfigDraft] = useState<PoolConfig | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("—");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string | null }>>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [newAllowance, setNewAllowance] = useState<string>("");
  const [weeklyCapForAll, setWeeklyCapForAll] = useState<string>("");
  const [topUpForAll, setTopUpForAll] = useState<string>("");
  const [isUpdatingAllowance, setIsUpdatingAllowance] = useState(false);
  const [isSettingWeeklyCapForAll, setIsSettingWeeklyCapForAll] = useState(false);
  const [isGrantingTopUpForAll, setIsGrantingTopUpForAll] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<AdminUserBalanceResponse | null>(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);
  const [userDetailsError, setUserDetailsError] = useState<string | null>(null);
  const [deletingClaimId, setDeletingClaimId] = useState<string | null>(null);
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>("weekly");

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    try {
      const [statsRes, configRes] = await Promise.all([
        fetch("/api/admin/stats", { cache: "no-store" }),
        fetch("/api/admin/config", { cache: "no-store" }),
      ]);

      if (statsRes.status === 401 || configRes.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!statsRes.ok) {
        throw new Error(await readApiError(statsRes));
      }
      if (!configRes.ok) {
        throw new Error(await readApiError(configRes));
      }

      const [nextStats, nextConfig] = (await Promise.all([
        statsRes.json(),
        configRes.json(),
      ])) as [AdminStatsResponse, AdminConfigResponse];

      setStatsData(nextStats);
      setConfigData(nextConfig);
      setConfigDraft(nextConfig.config);
      hasLoadedRef.current = true;

      const time = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setLastUpdated(`Updated ${time}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown fetch failure";
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [router]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users?limit=100", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        throw new Error(await readApiError(res));
      }
      const data = (await res.json()) as { users: Array<{ id: string; email: string; name: string | null }> };
      setUsers(data.users);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  }, [router]);

  const fetchUserDetails = useCallback(
    async (userId: string) => {
      setIsLoadingUserDetails(true);
      setUserDetailsError(null);
      try {
        const res = await fetch(`/api/admin/user-balance?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          throw new Error(await readApiError(res));
        }
        const data = (await res.json()) as AdminUserBalanceResponse;
        setSelectedUserDetails(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch user details";
        setUserDetailsError(message);
      } finally {
        setIsLoadingUserDetails(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void fetchData();
    void fetchUsers();
    const interval = window.setInterval(() => {
      void fetchData();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchData, fetchUsers]);

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUserDetails(null);
      setUserDetailsError(null);
      return;
    }
    void fetchUserDetails(selectedUserId);
  }, [selectedUserId, fetchUserDetails]);

  const weekRange = useMemo(() => {
    if (!statsData) return "Loading week data...";

    const weekStart = new Date(statsData.pool.weekStart);
    const weekEnd = new Date(statsData.pool.weekEnd);
    const formatDate = (date: Date) =>
      date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    return `Week of ${formatDate(weekStart)} — ${formatDate(weekEnd)}`;
  }, [statsData]);

  const handleNavClick = useCallback((section: NavSection) => {
    setActiveSection(section);
    setIsSidebarOpen(false);

    if (section === "overview") {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (section === "pool" || section === "claims") {
      poolSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (section === "config") {
      configSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (section === "api") {
      apiSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (section === "users") {
      usersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    donorsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleConfigNumberChange = useCallback(
    (field: NumericConfigField, value: string) => {
      setConfigDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [field]: Number(value),
        };
      });
    },
    []
  );

  const handleConfigTextChange = useCallback(
    (field: TextConfigField, value: string) => {
      setConfigDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [field]: value,
        };
      });
    },
    []
  );

  const loadConfig = useCallback(() => {
    if (!configData) return;
    setConfigDraft(configData.config);
  }, [configData]);

  const saveConfig = useCallback(async () => {
    if (!configDraft) return;

    const payload = {
      defaultWeeklyAllowance: Number(configDraft.defaultWeeklyAllowance),
      defaultClaimAmount: Number(configDraft.defaultClaimAmount),
      codeExpiryMinutes: Number(configDraft.codeExpiryMinutes),
      maxClaimsPerDay: Number(configDraft.maxClaimsPerDay),
      minDonationAmount: Number(configDraft.minDonationAmount),
      maxDonationAmount: Number(configDraft.maxDonationAmount),
      poolCalculationMethod: configDraft.poolCalculationMethod,
      donorSelectionPolicy: configDraft.donorSelectionPolicy,
      iosRequiredVersion: configDraft.iosRequiredVersion.trim(),
      androidRequiredVersion: configDraft.androidRequiredVersion.trim(),
      iosStoreUrl: configDraft.iosStoreUrl?.trim() || null,
      androidStoreUrl: configDraft.androidStoreUrl?.trim() || null,
    };

    setIsSaving(true);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const nextConfig = (await res.json()) as AdminConfigResponse;
      setConfigData(nextConfig);
      setConfigDraft(nextConfig.config);
      setToast("Configuration saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setToast(`Failed to save — ${message}`);
    } finally {
      setIsSaving(false);
    }
  }, [configDraft, router]);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.assign("/admin/login?logout=1");
      setIsLoggingOut(false);
    }
  }, []);

  const handleUpdateAllowance = useCallback(async () => {
    if (!selectedUserId || !newAllowance) {
      setToast("Please select a user and enter an allowance");
      return;
    }

    const allowanceNum = parseFloat(newAllowance);
    if (Number.isNaN(allowanceNum) || allowanceNum < 0) {
      setToast("Invalid allowance amount");
      return;
    }

    setIsUpdatingAllowance(true);
    try {
      const res = await fetch("/api/admin/update-allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          availablePoints: allowanceNum,
        }),
      });

      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      await res.json();
      setToast(`Available points updated to ${allowanceNum} points`);
      setNewAllowance("");
      void fetchData(); // Refresh to show updated data
      void fetchUserDetails(selectedUserId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      setToast(`Failed to update allowance — ${message}`);
    } finally {
      setIsUpdatingAllowance(false);
    }
  }, [selectedUserId, newAllowance, router, fetchData, fetchUserDetails]);

  const handleSetWeeklyCapForAll = useCallback(async () => {
    if (!weeklyCapForAll) {
      setToast("Enter a weekly cap value to apply to everyone");
      return;
    }

    const weeklyLimitNum = parseFloat(weeklyCapForAll);
    if (Number.isNaN(weeklyLimitNum) || weeklyLimitNum < 0) {
      setToast("Invalid allowance amount");
      return;
    }

    const confirmed = window.confirm(
      `Set weekly cap to ${weeklyLimitNum} for every user this week? Remaining points will become max(cap - used, 0).`
    );
    if (!confirmed) {
      return;
    }

    setIsSettingWeeklyCapForAll(true);
    try {
      const res = await fetch("/api/admin/update-allowance-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyLimit: weeklyLimitNum,
        }),
      });

      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const data = (await res.json()) as {
        usersProcessed: number;
        updatedCount: number;
        insertedCount: number;
      };
      setToast(
        `Set cap for ${data.usersProcessed} users (${data.updatedCount} existing, ${data.insertedCount} new)`
      );
      setWeeklyCapForAll("");
      void fetchData();
      if (selectedUserId) {
        void fetchUserDetails(selectedUserId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bulk cap update failed";
      setToast(`Failed to set weekly cap — ${message}`);
    } finally {
      setIsSettingWeeklyCapForAll(false);
    }
  }, [weeklyCapForAll, router, fetchData, fetchUserDetails, selectedUserId]);

  const handleGrantTopUpForAll = useCallback(async () => {
    if (!topUpForAll) {
      setToast("Enter extra points to grant");
      return;
    }

    const topUpPointsNum = parseFloat(topUpForAll);
    if (Number.isNaN(topUpPointsNum) || topUpPointsNum < 0) {
      setToast("Invalid top-up amount");
      return;
    }

    const confirmed = window.confirm(
      `Grant ${topUpPointsNum} extra remaining points to every user this week?`
    );
    if (!confirmed) {
      return;
    }

    setIsGrantingTopUpForAll(true);
    try {
      const res = await fetch("/api/admin/grant-allowance-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topUpPoints: topUpPointsNum,
        }),
      });

      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      const data = (await res.json()) as {
        usersProcessed: number;
        updatedCount: number;
        insertedCount: number;
      };
      setToast(
        `Granted top-up to ${data.usersProcessed} users (${data.updatedCount} existing, ${data.insertedCount} new)`
      );
      setTopUpForAll("");
      void fetchData();
      if (selectedUserId) {
        void fetchUserDetails(selectedUserId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Top-up failed";
      setToast(`Failed to grant top-up — ${message}`);
    } finally {
      setIsGrantingTopUpForAll(false);
    }
  }, [topUpForAll, router, fetchData, fetchUserDetails, selectedUserId]);

  const handleDeleteClaim = useCallback(async (claimId: string, userId: string) => {
    if (!window.confirm("Are you sure you want to delete this claim? If it hasn't been redeemed, the points will be refunded.")) {
      return;
    }

    setDeletingClaimId(claimId);
    try {
      const res = await fetch("/api/claims/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, claimCodeId: claimId }),
      });

      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        throw new Error(await readApiError(res));
      }

      setToast("Claim deleted successfully");
      void fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setToast(`Failed to delete claim — ${message}`);
    } finally {
      setDeletingClaimId(null);
    }
  }, [router, fetchData]);

  const poolMetrics = useMemo(() => {
    if (!statsData) {
      return {
        remainingPct: 0,
        poolBarTone: "success",
        utilizationPctDisplay: 0,
        gaugeOffset: 377,
        gaugeTone: "",
        redemptionOffset: 213.6,
        poolWeekBadge: "—",
      };
    }

    const remainingPct =
      statsData.pool.totalAmount > 0
        ? Math.round((statsData.pool.remainingAmount / statsData.pool.totalAmount) * 100)
        : 0;

    const clampedRemaining = Math.max(0, Math.min(100, remainingPct));

    const poolBarTone =
      clampedRemaining < 20 ? "danger" : clampedRemaining < 50 ? "warning" : "success";

    const utilizationPctDisplay = Math.max(0, Math.min(100, statsData.pool.utilizationPct));

    const gaugeCircumference = 2 * Math.PI * 60;
    const gaugeOffset =
      gaugeCircumference - (utilizationPctDisplay / 100) * gaugeCircumference;

    const gaugeTone =
      statsData.pool.utilizationPct > 90
        ? "danger"
        : statsData.pool.utilizationPct > 70
          ? "warning"
          : "";

    const redemptionCircumference = 2 * Math.PI * 34;
    const redemptionOffset =
      redemptionCircumference -
      (Math.max(0, Math.min(100, statsData.claims.thisWeek.redemptionRate)) / 100) *
        redemptionCircumference;

    const weekStart = new Date(statsData.pool.weekStart);
    const poolWeekBadge = statsData.pool.isEstimated
      ? `Week ${getWeekNumber(weekStart)} · estimated`
      : `Week ${getWeekNumber(weekStart)}`;

    return {
      remainingPct: clampedRemaining,
      poolBarTone,
      utilizationPctDisplay,
      gaugeOffset,
      gaugeTone,
      redemptionOffset,
      poolWeekBadge,
    };
  }, [statsData]);

  const sortedPoolHistory = useMemo(() => {
    if (!statsData?.poolHistory?.length) return [];
    return [...statsData.poolHistory].reverse();
  }, [statsData]);

  const chartHistory = useMemo(() => {
    if (!statsData) return [];

    if (chartGranularity === "daily") {
      return (statsData.dailyHistory ?? []).map((entry) => ({
        periodStart: entry.dayStart,
        label: entry.dayLabel,
        totalAmount: entry.redeemedAmount,
        allocatedAmount: entry.remainingAmount,
      }));
    }

    return sortedPoolHistory.map((entry) => ({
      periodStart: entry.weekStart,
      label: new Date(entry.weekStart).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      totalAmount: entry.allocatedAmount,
      allocatedAmount: entry.remainingAmount,
    }));
  }, [chartGranularity, sortedPoolHistory, statsData]);

  const chartMeta = useMemo(
    () =>
      chartGranularity === "daily"
        ? {
            subtitle: "Last 14 days",
            totalLabel: "Redeemed",
            allocatedLabel: "Remaining Pool",
          }
        : {
            subtitle: "Last 8 weeks",
            totalLabel: "Redeemed",
            allocatedLabel: "Remaining",
          },
    [chartGranularity]
  );

  const maxPoolHistoryValue = useMemo(() => {
    if (!chartHistory.length) return 1;
    return Math.max(
      1,
      ...chartHistory.map((entry) =>
        Math.max(Math.max(0, entry.totalAmount), Math.max(0, entry.allocatedAmount))
      )
    );
  }, [chartHistory]);

  const poolHistoryAxis = useMemo(() => {
    const roughStep = maxPoolHistoryValue / 4;
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)));
    const normalized = roughStep / magnitude;
    const stepBase = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const step = Math.max(1, stepBase * magnitude);
    const max = step * 4;
    const ticks = [0, step, step * 2, step * 3, max];

    return { max, ticks };
  }, [maxPoolHistoryValue]);

  const claimStat = useCallback(
    (status: ClaimStatus): ClaimAggregate => {
      if (!statsData) return { count: 0, amount: 0 };
      return statsData.claims.thisWeek.byStatus[status] ?? { count: 0, amount: 0 };
    },
    [statsData]
  );

  return (
    <div className="admin-root">
      <div className="app">
        <aside className={`sidebar${isSidebarOpen ? " open" : ""}`}>
          <div className="sidebar-brand">
            <h1>
              Slug<span>Swap</span>
            </h1>
            <p>Control Deck</p>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section-label">Monitor</div>
            <button
              type="button"
              className={`nav-item${activeSection === "overview" ? " active" : ""}`}
              onClick={() => handleNavClick("overview")}
            >
              <span className="nav-icon">◈</span>
              Overview
            </button>
            <button
              type="button"
              className={`nav-item${activeSection === "pool" ? " active" : ""}`}
              onClick={() => handleNavClick("pool")}
            >
              <span className="nav-icon">◓</span>
              Pool Health
            </button>
            <button
              type="button"
              className={`nav-item${activeSection === "claims" ? " active" : ""}`}
              onClick={() => handleNavClick("claims")}
            >
              <span className="nav-icon">❖</span>
              Claims
            </button>

            <div className="nav-section-label">Manage</div>
            <button
              type="button"
              className={`nav-item${activeSection === "config" ? " active" : ""}`}
              onClick={() => handleNavClick("config")}
            >
              <span className="nav-icon">⚙</span>
              Configuration
            </button>
            <button
              type="button"
              className={`nav-item${activeSection === "users" ? " active" : ""}`}
              onClick={() => handleNavClick("users")}
            >
              <span className="nav-icon">👤</span>
              User Allowances
            </button>
            <button
              type="button"
              className={`nav-item${activeSection === "donors" ? " active" : ""}`}
              onClick={() => handleNavClick("donors")}
            >
              <span className="nav-icon">♥</span>
              Donors
            </button>

            <div className="nav-section-label">Developer</div>
            <button
              type="button"
              className={`nav-item${activeSection === "api" ? " active" : ""}`}
              onClick={() => handleNavClick("api")}
            >
              <span className="nav-icon">⌘</span>
              API Query
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className={`status-badge${error ? " error" : ""}`}>
              <span className="status-dot" />
              {error ? "Connection Error" : "System Healthy"}
            </div>
          </div>
        </aside>

        {isSidebarOpen ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <main className="main" ref={mainRef}>
          <div className="top-bar">
            <div className="top-bar-left">
              <div className="top-title-row">
                <button
                  type="button"
                  className="mobile-menu-btn"
                  aria-label="Open sidebar"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  ☰
                </button>
                <h2>{SECTION_TITLES[activeSection]}</h2>
              </div>
              <p>{weekRange}</p>
            </div>
            <div className="top-bar-right">
              <span className="auto-refresh-tag">{lastUpdated}</span>
              <button
                type="button"
                className="refresh-btn"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Signing out..." : "Sign out"}
              </button>
              <button
                type="button"
                className={`refresh-btn${isRefreshing ? " loading" : ""}`}
                onClick={() => {
                  void fetchData();
                }}
                disabled={isRefreshing}
              >
                <span className="refresh-icon">↻</span>
                Refresh
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              Connecting to database...
            </div>
          ) : null}

          {error && !statsData ? (
            <div className="error-state">
              <h3>Connection Failed</h3>
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 16 }}
                onClick={() => {
                  void fetchData();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {statsData ? (
            <>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">
                    <span className="label-icon">◓</span>
                    Pool Available
                  </div>
                  <div className="metric-value gold">{formatNum(statsData.pool.remainingAmount)}</div>
                  <div className="metric-sub">
                    of <span>{formatNum(statsData.pool.totalAmount)}</span> pts capacity
                    {statsData.pool.isEstimated ? " (current donors)" : ""}
                  </div>
                  <div className="progress-bar-wrap">
                    <div
                      className={`progress-bar-fill ${poolMetrics.poolBarTone}`}
                      style={{ width: `${poolMetrics.remainingPct}%` }}
                    />
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">
                    <span className="label-icon">♥</span>
                    Active Donors
                  </div>
                  <div className="metric-value">{formatNum(statsData.donors.active)}</div>
                  <div className="metric-sub">
                    <span>{formatNum(statsData.donors.paused)}</span> paused ·{" "}
                    <span>{formatNum(statsData.donors.weeklyInflow)}</span>/wk inflow
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">
                    <span className="label-icon">❖</span>
                    Claims This Week
                  </div>
                  <div className="metric-value">{formatNum(statsData.claims.thisWeek.total)}</div>
                  <div className="metric-sub">
                    Redemption rate: <span>{formatNum(statsData.claims.thisWeek.redemptionRate)}%</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">
                    <span className="label-icon">☆</span>
                    Total Users
                  </div>
                  <div className="metric-value">{formatNum(statsData.users.total)}</div>
                  <div className="metric-sub">
                    <span>{formatNum(statsData.users.linkedGetAccounts)}</span> GET accounts linked
                  </div>
                </div>
              </div>

              <div className="alltime-row">
                <div className="alltime-stat">
                  <div className="alltime-label">All-time Claims</div>
                  <div className="alltime-value">{formatNum(statsData.claims.allTime.total)}</div>
                </div>
                <div className="alltime-stat">
                  <div className="alltime-label">Points Distributed</div>
                  <div className="alltime-value">{formatNum(statsData.claims.allTime.redeemedAmount)}</div>
                </div>
                <div className="alltime-stat">
                  <div className="alltime-label">Avg Donation / Wk</div>
                  <div className="alltime-value">{formatNum(statsData.donors.avgWeeklyDonation)}</div>
                </div>
                <div className="alltime-stat">
                  <div className="alltime-label">Avg Pts / Requester</div>
                  <div className="alltime-value">{formatNum(statsData.users.avgPointsPerRequesterThisWeek)}</div>
                </div>
              </div>

              <div className="section-grid three-col" ref={poolSectionRef}>
                <div className="card" style={{ animationDelay: "0.3s" }}>
                  <div className="card-header">
                    <span className="card-title">Pool Utilization</span>
                    <span className="card-badge">{poolMetrics.poolWeekBadge}</span>
                  </div>
                  <div className="pool-gauge-container">
                    <div className="gauge-ring">
                      <svg viewBox="0 0 140 140">
                        <circle className="gauge-bg" cx="70" cy="70" r="60" />
                        <circle
                          className={`gauge-fill${poolMetrics.gaugeTone ? ` ${poolMetrics.gaugeTone}` : ""}`}
                          cx="70"
                          cy="70"
                          r="60"
                          style={{ strokeDashoffset: poolMetrics.gaugeOffset }}
                        />
                      </svg>
                      <div className="gauge-center">
                        <span className="gauge-pct">{formatNum(poolMetrics.utilizationPctDisplay)}%</span>
                        <span className="gauge-pct-label">utilized</span>
                      </div>
                    </div>
                    <div className="pool-details">
                      <div className="pool-detail-row">
                        <span className="pool-detail-label">Live Capacity</span>
                        <span className="pool-detail-value">
                          {formatNum(statsData.pool.totalAmount)} pts
                          {statsData.pool.isEstimated ? " (current donors)" : ""}
                        </span>
                      </div>
                      <div className="pool-detail-row">
                        <span className="pool-detail-label">Allocated</span>
                        <span className="pool-detail-value allocated">
                          {formatNum(statsData.pool.allocatedAmount)} pts
                        </span>
                      </div>
                      <div className="pool-detail-row">
                        <span className="pool-detail-label">Remaining</span>
                        <span className="pool-detail-value remaining">
                          {formatNum(statsData.pool.remainingAmount)} pts
                        </span>
                      </div>
                      <div className="pool-detail-row">
                        <span className="pool-detail-label">Unique Requesters</span>
                        <span className="pool-detail-value">
                          {formatNum(statsData.users.uniqueRequesters)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ animationDelay: "0.35s" }}>
                  <div className="card-header">
                    <span className="card-title">Claims This Week</span>
                  </div>
                  <div className="claims-breakdown">
                    <div className="claim-stat">
                      <span className="claim-stat-label">Redeemed</span>
                      <span className="claim-stat-value redeemed">{claimStat("redeemed").count}</span>
                      <span className="claim-stat-sub">{formatNum(claimStat("redeemed").amount)} pts</span>
                    </div>
                    <div className="claim-stat">
                      <span className="claim-stat-label">Pending</span>
                      <span className="claim-stat-value pending">{claimStat("pending").count}</span>
                      <span className="claim-stat-sub">{formatNum(claimStat("pending").amount)} pts</span>
                    </div>
                    <div className="claim-stat">
                      <span className="claim-stat-label">Active</span>
                      <span className="claim-stat-value">{claimStat("active").count}</span>
                      <span className="claim-stat-sub">{formatNum(claimStat("active").amount)} pts</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 20, textAlign: "center" }}>
                    <div className="redemption-ring">
                      <svg viewBox="0 0 80 80">
                        <circle
                          fill="none"
                          stroke="var(--bg-elevated)"
                          strokeWidth="7"
                          cx="40"
                          cy="40"
                          r="34"
                        />
                        <circle
                          fill="none"
                          stroke="var(--success)"
                          strokeWidth="7"
                          strokeLinecap="round"
                          cx="40"
                          cy="40"
                          r="34"
                          strokeDasharray="213.6"
                          style={{
                            strokeDashoffset: poolMetrics.redemptionOffset,
                            transition: "stroke-dashoffset 1.2s var(--ease-out)",
                          }}
                        />
                      </svg>
                      <div className="redemption-center">
                        {formatNum(statsData.claims.thisWeek.redemptionRate)}%
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Redemption Rate
                    </div>
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="section-header">
                  <span className="section-title">Pool History</span>
                  <div className="chart-header-right">
                    <span className="section-subtitle">{chartMeta.subtitle}</span>
                    <div className="chart-toggle" role="tablist" aria-label="Pool history granularity">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={chartGranularity === "weekly"}
                        className={`chart-toggle-btn${chartGranularity === "weekly" ? " active" : ""}`}
                        onClick={() => setChartGranularity("weekly")}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={chartGranularity === "daily"}
                        className={`chart-toggle-btn${chartGranularity === "daily" ? " active" : ""}`}
                        onClick={() => setChartGranularity("daily")}
                      >
                        Daily
                      </button>
                    </div>
                  </div>
                </div>
                <div className="card" style={{ animationDelay: "0.4s" }}>
                  <div className="bar-chart-wrap">
                    <div className="y-axis">
                      {poolHistoryAxis.ticks
                        .slice()
                        .reverse()
                        .map((tick) => (
                          <span className="y-axis-tick" key={tick}>
                            {formatNum(tick)}
                          </span>
                        ))}
                      <span className="y-axis-unit">pts</span>
                    </div>
                    <div className="bar-chart">
                      {chartHistory.length ? (
                        <>
                          <div className="bar-grid-lines" aria-hidden="true">
                            {poolHistoryAxis.ticks.map((tick) => {
                              const bottom = poolHistoryAxis.max > 0 ? (tick / poolHistoryAxis.max) * 100 : 0;
                              return (
                                <span
                                  className="bar-grid-line"
                                  key={`tick-${tick}`}
                                  style={{ bottom: `${Math.max(0, Math.min(100, bottom))}%` }}
                                />
                              );
                            })}
                          </div>
                          {chartHistory.map((entry, index) => {
                            const totalHeight = Math.max(
                              0,
                              Math.min(100, (entry.totalAmount / poolHistoryAxis.max) * 100)
                            );
                            const allocatedHeight = Math.max(
                              0,
                              Math.min(100, (entry.allocatedAmount / poolHistoryAxis.max) * 100)
                            );

                            return (
                              <div
                                className="bar-group"
                                key={entry.periodStart}
                                tabIndex={0}
                                aria-label={`${entry.label}. ${chartMeta.totalLabel} ${formatNum(entry.totalAmount)} points, ${chartMeta.allocatedLabel} ${formatNum(entry.allocatedAmount)} points.`}
                              >
                                <div className="bar-tooltip" role="presentation" aria-hidden="true">
                                  <div className="bar-tooltip-title">{entry.label}</div>
                                  <div className="bar-tooltip-row">
                                    <span>{chartMeta.totalLabel}</span>
                                    <span>{formatNum(entry.totalAmount)} pts</span>
                                  </div>
                                  <div className="bar-tooltip-row">
                                    <span>{chartMeta.allocatedLabel}</span>
                                    <span>{formatNum(entry.allocatedAmount)} pts</span>
                                  </div>
                                </div>
                                <div className="bar-stack">
                                  <div
                                    className="bar total"
                                    style={{
                                      height: `${totalHeight}%`,
                                      animationDelay: `${index * 0.08}s`,
                                    }}
                                  />
                                  <div
                                    className="bar allocated"
                                    style={{
                                      height: `${allocatedHeight}%`,
                                      animationDelay: `${index * 0.08 + 0.1}s`,
                                    }}
                                  />
                                </div>
                                <span className="bar-label">{entry.label}</span>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="empty-state">No pool history yet</div>
                      )}
                    </div>
                  </div>
                  <div className="legend-row">
                    <span className="legend-item">
                      <span className="legend-chip total" />
                      {chartMeta.totalLabel}
                    </span>
                    <span className="legend-item">
                      <span className="legend-chip allocated" />
                      {chartMeta.allocatedLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="section" ref={configSectionRef}>
                <div className="section-header">
                  <span className="section-title">Pool Configuration</span>
                  <span className="section-subtitle">Adjust system defaults</span>
                </div>
                <div className="card" style={{ animationDelay: "0.45s" }}>
                  <div className="config-grid">
                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-weekly-allowance">
                        Weekly Allowance / User
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-weekly-allowance"
                          className="config-input"
                          type="number"
                          min={1}
                          max={1000}
                          value={configDraft?.defaultWeeklyAllowance ?? ""}
                          onChange={(event) =>
                            handleConfigNumberChange("defaultWeeklyAllowance", event.target.value)
                          }
                        />
                        <span className="config-unit">pts</span>
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-claim-amount">
                        Default Claim Amount
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-claim-amount"
                          className="config-input"
                          type="number"
                          min={1}
                          max={500}
                          value={configDraft?.defaultClaimAmount ?? ""}
                          onChange={(event) =>
                            handleConfigNumberChange("defaultClaimAmount", event.target.value)
                          }
                        />
                        <span className="config-unit">pts</span>
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-expiry">
                        Code Expiry
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-expiry"
                          className="config-input"
                          type="number"
                          min={1}
                          max={60}
                          value={configDraft?.codeExpiryMinutes ?? ""}
                          onChange={(event) =>
                            handleConfigNumberChange("codeExpiryMinutes", event.target.value)
                          }
                        />
                        <span className="config-unit">min</span>
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-max-claims">
                        Max Claims / Day
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-max-claims"
                          className="config-input"
                          type="number"
                          min={1}
                          max={50}
                          value={configDraft?.maxClaimsPerDay ?? ""}
                          onChange={(event) =>
                            handleConfigNumberChange("maxClaimsPerDay", event.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-min-donation">
                        Min Donation
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-min-donation"
                          className="config-input"
                          type="number"
                          min={1}
                          max={1000}
                          value={configDraft?.minDonationAmount ?? ""}
                          onChange={(event) =>
                            handleConfigNumberChange("minDonationAmount", event.target.value)
                          }
                        />
                        <span className="config-unit">pts/wk</span>
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-max-donation">
                        Max Donation
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-max-donation"
                          className="config-input"
                          type="number"
                          min={1}
                          max={10000}
                          value={configDraft?.maxDonationAmount ?? ""}
                          onChange={(event) =>
                            handleConfigNumberChange("maxDonationAmount", event.target.value)
                          }
                        />
                        <span className="config-unit">pts/wk</span>
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-method">
                        Allocation Method
                      </label>
                      <select
                        id="cfg-method"
                        className="config-select"
                        value={configDraft?.poolCalculationMethod ?? "equal"}
                        onChange={(event) => {
                          const nextMethod = event.target.value;
                          setConfigDraft((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              poolCalculationMethod:
                                nextMethod === "proportional" ? "proportional" : "equal",
                            };
                          });
                        }}
                      >
                        <option value="equal">Equal Split</option>
                        <option value="proportional">Proportional</option>
                      </select>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-donor-policy">
                        Donor Selection Policy
                      </label>
                      <select
                        id="cfg-donor-policy"
                        className="config-select"
                        value={configDraft?.donorSelectionPolicy ?? "least_utilized"}
                        onChange={(event) => {
                          const nextPolicy = event.target.value as DonorSelectionPolicy;
                          setConfigDraft((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              donorSelectionPolicy: nextPolicy,
                            };
                          });
                        }}
                      >
                        <option value="round_robin">Round Robin</option>
                        <option value="weighted_round_robin">Weighted Round Robin</option>
                        <option value="least_utilized">Least Utilized</option>
                        <option value="highest_balance">Highest Balance</option>
                      </select>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-ios-required-version">
                        iOS Required Version
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-ios-required-version"
                          className="config-input"
                          type="text"
                          value={configDraft?.iosRequiredVersion ?? ""}
                          onChange={(event) =>
                            handleConfigTextChange("iosRequiredVersion", event.target.value)
                          }
                          placeholder="1.0.0"
                        />
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-android-required-version">
                        Android Required Version
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-android-required-version"
                          className="config-input"
                          type="text"
                          value={configDraft?.androidRequiredVersion ?? ""}
                          onChange={(event) =>
                            handleConfigTextChange("androidRequiredVersion", event.target.value)
                          }
                          placeholder="1.0.0"
                        />
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-ios-store-url">
                        iOS Update URL
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-ios-store-url"
                          className="config-input"
                          type="url"
                          value={configDraft?.iosStoreUrl ?? ""}
                          onChange={(event) =>
                            handleConfigTextChange("iosStoreUrl", event.target.value)
                          }
                          placeholder="https://testflight.apple.com/join/..."
                        />
                      </div>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="cfg-android-store-url">
                        Android Update URL
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="cfg-android-store-url"
                          className="config-input"
                          type="url"
                          value={configDraft?.androidStoreUrl ?? ""}
                          onChange={(event) =>
                            handleConfigTextChange("androidStoreUrl", event.target.value)
                          }
                          placeholder="https://play.google.com/store/apps/details?id=..."
                        />
                      </div>
                    </div>
                  </div>
                  <p
                    style={{
                      marginTop: 10,
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Required app versions are enforced gates. Users below the platform version
                    will be blocked until they update.
                  </p>
                  <div className="config-actions">
                    <button type="button" className="btn btn-ghost" onClick={loadConfig}>
                      Reset
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void saveConfig();
                      }}
                      disabled={isSaving || !configDraft}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="section" ref={usersSectionRef}>
                <div className="section-header">
                  <span className="section-title">User Allowance Management</span>
                  <span className="section-subtitle">Set allowance and inspect per-user status, usage, and balances</span>
                </div>
                <div className="card" style={{ animationDelay: "0.47s" }}>
                  <div className="config-grid">
                    <div className="config-item">
                      <label className="config-label" htmlFor="weekly-cap-all">
                        Set Weekly Cap for Everyone (Current Week)
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="weekly-cap-all"
                          className="config-input"
                          type="number"
                          min={0}
                          max={1000}
                          value={weeklyCapForAll}
                          onChange={(event) => setWeeklyCapForAll(event.target.value)}
                          placeholder="Enter points"
                        />
                        <span className="config-unit">pts</span>
                      </div>
                    </div>
                  </div>
                  <div className="config-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setWeeklyCapForAll("")}
                      disabled={isSettingWeeklyCapForAll}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void handleSetWeeklyCapForAll();
                      }}
                      disabled={isSettingWeeklyCapForAll || !weeklyCapForAll}
                    >
                      {isSettingWeeklyCapForAll ? "Setting Cap..." : "Set Cap for Everyone"}
                    </button>
                  </div>
                </div>
                <div className="card" style={{ animationDelay: "0.475s" }}>
                  <div className="config-grid">
                    <div className="config-item">
                      <label className="config-label" htmlFor="top-up-all">
                        Grant Extra Remaining Points for Everyone (Optional Top-Up)
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="top-up-all"
                          className="config-input"
                          type="number"
                          min={0}
                          max={1000}
                          value={topUpForAll}
                          onChange={(event) => setTopUpForAll(event.target.value)}
                          placeholder="Enter points"
                        />
                        <span className="config-unit">pts</span>
                      </div>
                    </div>
                  </div>
                  <div className="config-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setTopUpForAll("")}
                      disabled={isGrantingTopUpForAll}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void handleGrantTopUpForAll();
                      }}
                      disabled={isGrantingTopUpForAll || !topUpForAll}
                    >
                      {isGrantingTopUpForAll ? "Granting Top-Up..." : "Grant Top-Up to Everyone"}
                    </button>
                  </div>
                </div>
                <div className="card" style={{ animationDelay: "0.48s" }}>
                  <div className="config-grid">
                    <div className="config-item">
                      <label className="config-label" htmlFor="user-select">
                        Select User
                      </label>
                      <select
                        id="user-select"
                        className="config-select"
                        value={selectedUserId}
                        onChange={(event) => {
                          setSelectedUserId(event.target.value);
                          setNewAllowance("");
                        }}
                      >
                        <option value="">Choose a user...</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name || user.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="config-item">
                      <label className="config-label" htmlFor="new-allowance">
                        Available Points (Remaining This Week)
                      </label>
                      <div className="config-input-wrap">
                        <input
                          id="new-allowance"
                          className="config-input"
                          type="number"
                          min={0}
                          max={1000}
                          value={newAllowance}
                          onChange={(event) => setNewAllowance(event.target.value)}
                          placeholder="Enter points"
                        />
                        <span className="config-unit">pts</span>
                      </div>
                    </div>
                  </div>
                  <div className="config-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setSelectedUserId("");
                        setNewAllowance("");
                        setSelectedUserDetails(null);
                        setUserDetailsError(null);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void handleUpdateAllowance();
                      }}
                      disabled={isUpdatingAllowance || !selectedUserId || !newAllowance}
                    >
                      {isUpdatingAllowance ? "Updating..." : "Update Allowance"}
                    </button>
                  </div>
                </div>

                {selectedUserId ? (
                  <div className="card" style={{ marginTop: 16, animationDelay: "0.49s" }}>
                    <div className="card-header">
                      <span className="card-title">Selected User Snapshot</span>
                      <span className="card-badge">
                        {selectedUserDetails?.weekWindow.timezone ?? "America/Los_Angeles"}
                      </span>
                    </div>

                    {isLoadingUserDetails ? (
                      <div className="empty-state">Loading user details...</div>
                    ) : userDetailsError ? (
                      <div className="empty-state">Failed to load: {userDetailsError}</div>
                    ) : selectedUserDetails ? (
                      <div style={{ display: "grid", gap: 16 }}>
                        <div className="config-grid">
                          <div className="config-item">
                            <div className="config-label">User</div>
                            <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                              {selectedUserDetails.user.name || selectedUserDetails.user.email || selectedUserDetails.user.id}
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                              {selectedUserDetails.user.id}
                            </div>
                          </div>

                          <div className="config-item">
                            <div className="config-label">GET Link Status</div>
                            <div
                              style={{
                                color: selectedUserDetails.getLinkStatus.linked
                                  ? "var(--success)"
                                  : "var(--danger)",
                                fontWeight: 600,
                              }}
                            >
                              {selectedUserDetails.getLinkStatus.linked ? "Linked" : "Not linked"}
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                              Linked at: {formatDateTime(selectedUserDetails.getLinkStatus.linkedAt)}
                            </div>
                            {selectedUserDetails.getLinkStatus.accountsFetchError ? (
                              <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: 4 }}>
                                {selectedUserDetails.getLinkStatus.accountsFetchError}
                              </div>
                            ) : null}
                          </div>

                          <div className="config-item">
                            <div className="config-label">Allowance (This Week)</div>
                            {selectedUserDetails.weeklyAllowance ? (
                              <>
                                <div style={{ color: "var(--text-primary)" }}>
                                  Used {formatNum(selectedUserDetails.weeklyAllowance.usedAmount)} / {formatNum(selectedUserDetails.weeklyAllowance.weeklyLimit)} pts
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                                  Remaining: {formatNum(selectedUserDetails.weeklyAllowance.remainingAmount)} pts
                                </div>
                              </>
                            ) : (
                              <div style={{ color: "var(--text-muted)" }}>No allowance record for current week</div>
                            )}
                          </div>

                          <div className="config-item">
                            <div className="config-label">GET Tracked Balance</div>
                            <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                              {formatNum(selectedUserDetails.trackedGetBalanceTotal)} pts
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                              Flexi + Banana + Slug
                            </div>
                          </div>
                        </div>

                        <div className="config-grid">
                          <div className="config-item">
                            <div className="config-label">Requester Usage</div>
                            <div style={{ color: "var(--text-primary)" }}>
                              This week: {formatNum(selectedUserDetails.requesterUsage.thisWeekClaimsAmount)} pts ({selectedUserDetails.requesterUsage.thisWeekClaimsCount} claims)
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                              Redeemed this week: {formatNum(selectedUserDetails.requesterUsage.thisWeekRedeemedAmount)} pts ({selectedUserDetails.requesterUsage.thisWeekRedeemedCount} claims)
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                              Active codes: {selectedUserDetails.requesterUsage.activeClaimsCount}
                            </div>
                          </div>

                          <div className="config-item">
                            <div className="config-label">Requester All-Time</div>
                            <div style={{ color: "var(--text-primary)" }}>
                              Claimed: {formatNum(selectedUserDetails.requesterUsage.allTimeClaimsAmount)} pts ({selectedUserDetails.requesterUsage.allTimeClaimsCount} claims)
                            </div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                              Redeemed: {formatNum(selectedUserDetails.requesterUsage.allTimeRedeemedAmount)} pts ({selectedUserDetails.requesterUsage.allTimeRedeemedCount} claims)
                            </div>
                          </div>

                          <div className="config-item">
                            <div className="config-label">Donor Usage</div>
                            {selectedUserDetails.donorUsage ? (
                              <>
                                <div style={{ color: "var(--text-primary)" }}>
                                  Status: {selectedUserDetails.donorUsage.status} · Cap: {formatNum(selectedUserDetails.donorUsage.weeklyAmount)} pts
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                                  Redeemed: {formatNum(selectedUserDetails.donorUsage.redeemedThisWeek)} · Reserved: {formatNum(selectedUserDetails.donorUsage.reservedThisWeek)} · Remaining: {formatNum(selectedUserDetails.donorUsage.remainingThisWeek)}
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                                  All-time donated: {formatNum(selectedUserDetails.donorUsage.allTimeRedeemedAmount)} pts ({selectedUserDetails.donorUsage.allTimeRedeemedCount} redemptions)
                                </div>
                              </>
                            ) : (
                              <div style={{ color: "var(--text-muted)" }}>This user is not configured as a donor</div>
                            )}
                          </div>

                          <div className="config-item">
                            <div className="config-label">Week Window</div>
                            <div style={{ color: "var(--text-primary)" }}>
                              {formatDateTime(selectedUserDetails.weekWindow.weekStart)} to {formatDateTime(selectedUserDetails.weekWindow.weekEnd)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: 8 }}>
                            GET Accounts
                          </div>
                          {selectedUserDetails.getBalance && selectedUserDetails.getBalance.length > 0 ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              {selectedUserDetails.getBalance.map((account) => (
                                <div
                                  key={account.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    padding: "8px 10px",
                                    border: "1px solid var(--border)",
                                    borderRadius: 10,
                                    background: "var(--bg-elevated)",
                                  }}
                                >
                                  <span>{account.accountDisplayName}</span>
                                  <span className="mono">
                                    {account.balance === null ? "n/a" : `${formatNum(account.balance)} pts`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="empty-state">No GET account balances available</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state">Select a user to load details</div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="section" ref={apiSectionRef}>
                <div className="section-header">
                  <span className="section-title">API Observatory</span>
                  <span className="section-subtitle">Direct backend query interface</span>
                </div>
                <div style={{ animationDelay: "0.5s" }}>
                  <ApiQuerySection />
                </div>
              </div>

              <div className="section-grid" ref={donorsSectionRef}>
                <div className="card" style={{ animationDelay: "0.5s" }}>
                  <div className="card-header">
                    <span className="card-title">Recent Claims</span>
                    <span className="card-badge">{statsData.recentClaims.length} recent</span>
                  </div>
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    <table className="activity-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Time</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsData.recentClaims.length ? (
                          statsData.recentClaims.map((claim) => {
                            const displayName = claim.userName
                              ? claim.userName
                              : claim.userEmail
                                ? claim.userEmail.split("@")[0]
                                : `${claim.userId.slice(0, 8)}...`;

                            const statusClass = isClaimStatus(claim.status)
                              ? claim.status
                              : "active";

                            return (
                              <tr key={claim.id}>
                                <td>{displayName}</td>
                                <td className="mono">{formatNum(claim.amount)} pts</td>
                                <td>
                                  <span className={`status-pill ${statusClass}`}>
                                    <span className="status-pill-dot" />
                                    {claim.status}
                                  </span>
                                </td>
                                <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                                  {timeAgo(claim.createdAt)}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn-icon btn-danger"
                                    onClick={() => handleDeleteClaim(claim.id, claim.userId)}
                                    disabled={deletingClaimId === claim.id}
                                    title="Delete claim"
                                  >
                                    {deletingClaimId === claim.id ? "..." : "🗑️"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="empty-state">
                              No claims yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card" style={{ animationDelay: "0.55s" }}>
                  <div className="card-header">
                    <span className="card-title">Top Donors</span>
                    <span className="card-badge">
                      {statsData.donorSelection.policy.replace(/_/g, " ")} · {statsData.donorSelection.timezone}
                    </span>
                  </div>
                  <div style={{ maxHeight: 340, overflowY: "auto" }}>
                    {statsData.topDonors.length ? (
                      statsData.topDonors.map((donor, index) => {
                        const statusClass = ["active", "paused", "cancelled"].includes(
                          donor.status
                        )
                          ? donor.status
                          : "active";
                        const donorGetBalanceLabel = !donor.hasLinkedGet
                          ? "GET not linked"
                          : donor.trackedGetBalanceTotal === null
                            ? "GET unavailable"
                            : `GET ${formatNum(donor.trackedGetBalanceTotal)} pts`;

                        return (
                          <div className="donor-row" key={`${donor.userId}-${index}`}>
                            <span className="donor-rank">{index + 1}</span>
                            <div className="donor-avatar">{getInitials(donor.name)}</div>
                            <div className="donor-info">
                              <div className="donor-name">{donor.name}</div>
                              <div className="donor-email">
                                {donor.email ? donor.email.split("@")[0] : "—"}
                              </div>
                              <div className="donor-balance">{donorGetBalanceLabel}</div>
                              <div className="donor-email">
                                Cap {formatNum(donor.capAmount)} · Redeemed {formatNum(donor.redeemedThisWeek)} · Reserved {formatNum(donor.reservedThisWeek)} · Remaining {formatNum(donor.remainingThisWeek)} · {donor.capReached ? "Cap reached" : "Within cap"}
                              </div>
                            </div>
                            <span className="donor-amount">{formatNum(donor.amount)}</span>
                            <span
                              className={`donor-status-dot ${statusClass}`}
                              title={donor.status}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-state">No donors yet</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </main>
      </div>

      <div className={`toast${toast ? " show" : ""}`}>{toast ?? ""}</div>
    </div>
  );
}
