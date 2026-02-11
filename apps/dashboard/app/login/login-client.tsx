"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ApiErrorBody = {
  error?: string;
};

type LoginProps = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Ignore non-JSON responses.
  }

  return "Authentication failed";
}

export default function AdminLoginClient({ supabaseUrl, supabaseAnonKey }: LoginProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const exchangeInFlightRef = useRef(false);

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }, [supabaseAnonKey, supabaseUrl]);

  const exchangeAdminSession = useCallback(
    async (accessToken: string) => {
      if (exchangeInFlightRef.current) {
        return;
      }

      exchangeInFlightRef.current = true;
      setError(null);

      try {
        const response = await fetch("/api/admin/login", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const message = await readError(response);
          if (response.status === 403) {
            setError("Signed in successfully, but this account is not allowed to access admin.");
          } else {
            setError(message);
          }
          return;
        }

        router.replace("/");
        router.refresh();
      } catch {
        setError("Unable to reach server");
      } finally {
        exchangeInFlightRef.current = false;
      }
    },
    [router]
  );

  useEffect(() => {
    if (!supabase) {
      setError("Supabase web auth is not configured for dashboard login.");
      setIsCheckingSession(false);
      return;
    }
    const client = supabase;

    let isMounted = true;

    async function initialize() {
      setIsCheckingSession(true);

      if (searchParams.get("logout") === "1") {
        await client.auth.signOut();
      }

      const {
        data: { session },
      } = await client.auth.getSession();

      if (session?.access_token) {
        await exchangeAdminSession(session.access_token);
      }

      if (isMounted) {
        setIsCheckingSession(false);
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!isMounted || !session?.access_token) {
        return;
      }

      void exchangeAdminSession(session.access_token);
    });

    void initialize();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [exchangeAdminSession, searchParams, supabase]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase || isRedirecting) {
      return;
    }

    setError(null);
    setIsRedirecting(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      });

      if (signInError) {
        setError(signInError.message);
        setIsRedirecting(false);
      }
    } catch {
      setError("Unable to start Google sign-in");
      setIsRedirecting(false);
    }
  }, [isRedirecting, supabase]);

  const signOutLocalSession = useCallback(async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setError(null);
  }, [supabase]);

  return (
    <main
      className="admin-root"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <section
        className="card"
        style={{
          width: "100%",
          maxWidth: "440px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <header style={{ marginBottom: "20px" }}>
          <p className="card-badge" style={{ display: "inline-block", marginBottom: "12px" }}>
            Admin Access
          </p>
          <h1 className="card-title" style={{ margin: 0 }}>
            SlugSwap Control Deck
          </h1>
          <p style={{ marginTop: "8px", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Sign in with Google and use an allowlisted admin account.
          </p>
        </header>

        <div style={{ display: "grid", gap: "12px" }}>
          {error ? (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--danger)" }}>{error}</p>
          ) : null}

          <button
            type="button"
            disabled={isCheckingSession || isRedirecting || !supabase}
            onClick={() => {
              void signInWithGoogle();
            }}
            style={{
              marginTop: "4px",
              borderRadius: "10px",
              border: "1px solid var(--accent-gold-dim)",
              background: "var(--accent-gold-glow)",
              color: "var(--text-secondary)",
              padding: "10px 12px",
              fontSize: "0.9rem",
              fontWeight: 500,
              fontFamily: "var(--font-body)",
              letterSpacing: "0.01em",
              cursor: isCheckingSession || isRedirecting || !supabase ? "not-allowed" : "pointer",
              opacity: isCheckingSession || isRedirecting || !supabase ? 0.7 : 1,
            }}
          >
            {isCheckingSession
              ? "Checking session..."
              : isRedirecting
                ? "Redirecting..."
                : "Continue with Google"}
          </button>

          <button
            type="button"
            disabled={!supabase || isCheckingSession || isRedirecting}
            onClick={() => {
              void signOutLocalSession();
            }}
            style={{
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              padding: "10px 12px",
              fontSize: "0.85rem",
              fontFamily: "var(--font-body)",
              letterSpacing: "0.01em",
              cursor: !supabase || isCheckingSession || isRedirecting ? "not-allowed" : "pointer",
              opacity: !supabase || isCheckingSession || isRedirecting ? 0.7 : 1,
            }}
          >
            Use a different Google account
          </button>
        </div>
      </section>
    </main>
  );
}
