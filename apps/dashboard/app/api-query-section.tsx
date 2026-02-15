"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type ApiEndpoint = {
  path: string;
  method: HttpMethod;
  description: string;
  requiresAuth: boolean;
  bodyExample?: string;
};

type RequestHistoryItem = {
  id: string;
  timestamp: Date;
  method: HttpMethod;
  path: string;
  status: number | null;
  duration: number | null;
  response: string | null;
  error: string | null;
};

const API_ENDPOINTS: ApiEndpoint[] = [
  // Health
  { path: "/api/health", method: "GET", description: "Health check", requiresAuth: false },
  // Admin (auth via session cookie)
  { path: "/api/admin/session", method: "GET", description: "Check admin session", requiresAuth: false },
  { path: "/api/admin/login", method: "POST", description: "Admin login (Bearer token)", requiresAuth: false },
  { path: "/api/admin/logout", method: "POST", description: "Admin logout", requiresAuth: false },
  { path: "/api/admin/stats", method: "GET", description: "Admin statistics (pool, donors, claims, users)", requiresAuth: true },
  {
    path: "/api/admin/users",
    method: "GET",
    description: "List users (?limit=50&offset=0)",
    requiresAuth: true,
  },
  {
    path: "/api/admin/user-balance",
    method: "GET",
    description: "User snapshot (?userId=) with GET link, balances, allowance, requester/donor usage",
    requiresAuth: true,
  },
  { path: "/api/admin/config", method: "GET", description: "Get pool configuration", requiresAuth: true },
  {
    path: "/api/admin/config",
    method: "PATCH",
    description: "Update pool configuration",
    requiresAuth: true,
    bodyExample: JSON.stringify(
      {
        defaultWeeklyAllowance: 50,
        defaultClaimAmount: 10,
        codeExpiryMinutes: 5,
        maxClaimsPerDay: 5,
        minDonationAmount: 10,
        maxDonationAmount: 500,
        poolCalculationMethod: "equal",
        donorSelectionPolicy: "least_utilized",
        iosRequiredVersion: "1.0.0",
        androidRequiredVersion: "1.0.0",
        iosStoreUrl: "https://testflight.apple.com/join/<code>",
        androidStoreUrl: "https://play.google.com/store/apps/details?id=<package>",
      },
      null,
      2
    ),
  },
  {
    path: "/api/mobile/config",
    method: "GET",
    description: "Public mobile update policy",
    requiresAuth: false,
  },
  // Claims
  {
    path: "/api/claims/generate",
    method: "POST",
    description: "Generate claim code for user",
    requiresAuth: true,
    bodyExample: JSON.stringify({ userId: "<user-id>", amount: 10 }, null, 2),
  },
  {
    path: "/api/claims/history",
    method: "GET",
    description: "Claim history for user (?userId=)",
    requiresAuth: true,
  },
  {
    path: "/api/claims/refresh",
    method: "POST",
    description: "Refresh existing claim code",
    requiresAuth: true,
    bodyExample: JSON.stringify({ userId: "<user-id>", claimCodeId: "<claim-id>" }, null, 2),
  },
  // Donations
  {
    path: "/api/donations/set",
    method: "POST",
    description: "Set or update donor weekly amount",
    requiresAuth: true,
    bodyExample: JSON.stringify(
      { userId: "<user-id>", amount: 25, userEmail: "donor@example.com" },
      null,
      2
    ),
  },
  {
    path: "/api/donations/impact",
    method: "GET",
    description: "Donor impact stats (?userId=)",
    requiresAuth: true,
  },
  {
    path: "/api/donations/pause",
    method: "PATCH",
    description: "Pause or resume donor",
    requiresAuth: true,
    bodyExample: JSON.stringify({ userId: "<user-id>", paused: true }, null, 2),
  },
  // GET (school point system)
  { path: "/api/get/login-url", method: "GET", description: "GET Tools login URL", requiresAuth: false },
  {
    path: "/api/get/link-status",
    method: "GET",
    description: "GET link status (?userId=)",
    requiresAuth: true,
  },
  {
    path: "/api/get/accounts",
    method: "GET",
    description: "GET accounts for user (?userId=)",
    requiresAuth: true,
  },
  {
    path: "/api/get/link",
    method: "POST",
    description: "Link GET account (validatedUrl from GET redirect)",
    requiresAuth: true,
    bodyExample: JSON.stringify(
      { userId: "<user-id>", userEmail: "user@example.com", validatedUrl: "https://..." },
      null,
      2
    ),
  },
  {
    path: "/api/get/link",
    method: "DELETE",
    description: "Unlink GET account (?userId=)",
    requiresAuth: true,
  },
  // Requesters
  {
    path: "/api/requesters/allowance",
    method: "GET",
    description: "Current week allowance (user auth)",
    requiresAuth: true,
  },
  // Users (app user profile; requires Bearer token)
  { path: "/api/users/me", method: "GET", description: "Current user (Bearer token)", requiresAuth: true },
  { path: "/api/users/profile", method: "GET", description: "User profile (Bearer token)", requiresAuth: true },
  {
    path: "/api/users/profile",
    method: "PATCH",
    description: "Update profile (Bearer token)",
    requiresAuth: true,
    bodyExample: JSON.stringify({ name: "Display Name", avatar_url: "https://..." }, null, 2),
  },
];

const METHOD_COLORS: Record<HttpMethod, { bg: string; text: string; border: string }> = {
  GET: { bg: "#1e3a2f", text: "#5aab7b", border: "#2d4a38" },
  POST: { bg: "#2f3140", text: "#7b8aab", border: "#3a3f52" },
  PATCH: { bg: "#3a301e", text: "#c7833a", border: "#4a3520" },
  DELETE: { bg: "#3a1e1e", text: "#c75c3a", border: "#4a2520" },
};

function syntaxHighlightJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "json-number";
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "json-key";
          } else {
            cls = "json-string";
          }
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function ApiQuerySection() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [requestPath, setRequestPath] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [responseData, setResponseData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [history, setHistory] = useState<RequestHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedEndpoint?.bodyExample) {
      setRequestBody(selectedEndpoint.bodyExample);
    } else {
      setRequestBody("");
    }
  }, [selectedEndpoint]);

  const handleExecuteRequest = useCallback(async () => {
    if (!selectedEndpoint) return;

    setIsLoading(true);
    setError(null);
    setResponseData(null);
    setStatusCode(null);
    setDuration(null);

    const startTime = performance.now();
    const requestId = `${Date.now()}-${Math.random()}`;

    const resolvedPath = requestPath.trim();
    if (!resolvedPath) {
      setError("Request path is required");
      setIsLoading(false);
      return;
    }

    try {
      const options: RequestInit = {
        method: selectedEndpoint.method,
        headers: {},
        cache: "no-store",
      };

      if (selectedEndpoint.method !== "GET" && requestBody.trim()) {
        options.headers = { "Content-Type": "application/json" };
        options.body = requestBody;
      }

      const response = await fetch(resolvedPath, options);
      const endTime = performance.now();
      const requestDuration = endTime - startTime;

      setStatusCode(response.status);
      setDuration(requestDuration);

      let responseText = "";
      try {
        const data = await response.json();
        responseText = JSON.stringify(data, null, 2);
      } catch {
        responseText = await response.text();
      }

      setResponseData(responseText);

      setHistory((prev) => [
        {
          id: requestId,
          timestamp: new Date(),
          method: selectedEndpoint.method,
          path: resolvedPath,
          status: response.status,
          duration: requestDuration,
          response: responseText,
          error: null,
        },
        ...prev.slice(0, 19),
      ]);
    } catch (err) {
      const endTime = performance.now();
      const requestDuration = endTime - startTime;
      const errorMessage = err instanceof Error ? err.message : "Request failed";

      setError(errorMessage);
      setDuration(requestDuration);

      setHistory((prev) => [
        {
          id: requestId,
          timestamp: new Date(),
          method: selectedEndpoint.method,
          path: resolvedPath,
          status: null,
          duration: requestDuration,
          response: null,
          error: errorMessage,
        },
        ...prev.slice(0, 19),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEndpoint, requestBody, requestPath]);

  const handleCopyResponse = useCallback(() => {
    if (!responseData) return;

    navigator.clipboard.writeText(responseData).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [responseData]);

  const handleReplayRequest = useCallback((item: RequestHistoryItem) => {
    const basePath = item.path.split("?")[0];
    const endpoint = API_ENDPOINTS.find(
      (e) => e.path === basePath && e.method === item.method
    );
    if (endpoint) {
      setSelectedEndpoint(endpoint);
      setRequestPath(item.path);
      setShowHistory(false);
    }
  }, []);

  return (
    <div className="api-query-root">
      <div className="api-query-header">
        <div className="api-query-title-row">
          <div className="api-query-icon">⌘</div>
          <div>
            <h3 className="api-query-title">API Observatory</h3>
            <p className="api-query-subtitle">Direct interface to backend services</p>
          </div>
        </div>
        <button
          type="button"
          className={`history-toggle ${showHistory ? "active" : ""}`}
          onClick={() => setShowHistory(!showHistory)}
        >
          <span className="history-icon">◷</span>
          History ({history.length})
        </button>
      </div>

      <div className="api-query-layout">
        {showHistory ? (
          <div className="history-panel">
            <div className="history-header">
              <span className="history-panel-title">Request History</span>
              <button
                type="button"
                className="history-clear"
                onClick={() => setHistory([])}
                disabled={history.length === 0}
              >
                Clear
              </button>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="history-empty">No requests yet</div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="history-item"
                    onClick={() => handleReplayRequest(item)}
                  >
                    <div className="history-item-top">
                      <span
                        className="history-method"
                        style={{
                          color: METHOD_COLORS[item.method].text,
                          backgroundColor: METHOD_COLORS[item.method].bg,
                          borderColor: METHOD_COLORS[item.method].border,
                        }}
                      >
                        {item.method}
                      </span>
                      <span className="history-path">{item.path}</span>
                    </div>
                    <div className="history-item-bottom">
                      <span className="history-time">
                        {item.timestamp.toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span
                        className={`history-status ${item.status && item.status >= 200 && item.status < 300 ? "success" : item.error ? "error" : "neutral"}`}
                      >
                        {item.status !== null ? item.status : "Failed"}
                      </span>
                      <span className="history-duration">{formatDuration(item.duration)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="endpoint-selector">
              <div className="endpoint-selector-header">
                <span className="endpoint-selector-label">Select Endpoint</span>
                <span className="endpoint-count">{API_ENDPOINTS.length} available</span>
              </div>
              <div className="endpoint-list">
                {API_ENDPOINTS.map((endpoint, index) => (
                  <button
                    key={`${endpoint.method}-${endpoint.path}-${index}`}
                    type="button"
                    className={`endpoint-item ${selectedEndpoint === endpoint ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedEndpoint(endpoint);
                      setRequestPath(endpoint.path);
                    }}
                  >
                    <div className="endpoint-item-top">
                      <span
                        className="endpoint-method"
                        style={{
                          color: METHOD_COLORS[endpoint.method].text,
                          backgroundColor: METHOD_COLORS[endpoint.method].bg,
                          borderColor: METHOD_COLORS[endpoint.method].border,
                        }}
                      >
                        {endpoint.method}
                      </span>
                      <span className="endpoint-path">{endpoint.path}</span>
                    </div>
                    <p className="endpoint-description">{endpoint.description}</p>
                    {endpoint.requiresAuth ? (
                      <span className="endpoint-auth-badge">🔒 Auth required</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="request-panel">
              {selectedEndpoint ? (
                <>
                  <div className="request-header">
                    <div className="request-method-row">
                      <span
                        className="request-method-badge"
                        style={{
                          color: METHOD_COLORS[selectedEndpoint.method].text,
                          backgroundColor: METHOD_COLORS[selectedEndpoint.method].bg,
                          borderColor: METHOD_COLORS[selectedEndpoint.method].border,
                        }}
                      >
                        {selectedEndpoint.method}
                      </span>
                      <span className="request-path-display">{selectedEndpoint.path}</span>
                    </div>
                    <p className="request-description">{selectedEndpoint.description}</p>
                  </div>

                  <div className="request-path-section">
                    <label className="request-body-label" htmlFor="request-path">
                      Request Path
                    </label>
                    <input
                      id="request-path"
                      className="request-path-input"
                      value={requestPath}
                      onChange={(e) => setRequestPath(e.target.value)}
                      placeholder="/api/admin/user-balance?userId=<user-id>"
                      spellCheck={false}
                    />
                    <p className="request-path-help">
                      Add query params directly, for example <code>?userId=...</code> or <code>?limit=100&offset=0</code>.
                    </p>
                  </div>

                  {selectedEndpoint.method !== "GET" ? (
                    <div className="request-body-section">
                      <label className="request-body-label" htmlFor="request-body">
                        Request Body (JSON)
                      </label>
                      <textarea
                        id="request-body"
                        className="request-body-input"
                        value={requestBody}
                        onChange={(e) => setRequestBody(e.target.value)}
                        placeholder='{"key": "value"}'
                        spellCheck={false}
                      />
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={`execute-btn ${isLoading ? "loading" : ""}`}
                    onClick={handleExecuteRequest}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="execute-spinner" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <span className="execute-icon">▶</span>
                        Execute Request
                      </>
                    )}
                  </button>

                  {(responseData || error) && (
                    <div className="response-section">
                      <div className="response-header">
                        <div className="response-status-row">
                          <span className="response-label">Response</span>
                          {statusCode !== null ? (
                            <span
                              className={`response-status ${statusCode >= 200 && statusCode < 300 ? "success" : statusCode >= 400 ? "error" : "neutral"}`}
                            >
                              {statusCode}
                            </span>
                          ) : null}
                          {duration !== null ? (
                            <span className="response-duration">{formatDuration(duration)}</span>
                          ) : null}
                        </div>
                        {responseData ? (
                          <button
                            type="button"
                            className={`copy-btn ${copied ? "copied" : ""}`}
                            onClick={handleCopyResponse}
                          >
                            {copied ? "✓ Copied" : "Copy"}
                          </button>
                        ) : null}
                      </div>

                      {error ? (
                        <div className="response-error">
                          <span className="error-icon">✕</span>
                          {error}
                        </div>
                      ) : null}

                      {responseData ? (
                        <div
                          ref={responseRef}
                          className="response-body"
                          dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(responseData) }}
                        />
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <div className="request-empty-state">
                  <div className="empty-state-icon">⌘</div>
                  <p className="empty-state-title">Select an endpoint to begin</p>
                  <p className="empty-state-subtitle">
                    Choose from the list to execute API requests
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .api-query-root {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          animation: slideUp 0.6s var(--ease-out);
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .api-query-header {
          padding: 24px 28px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-card) 100%);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .api-query-title-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .api-query-icon {
          width: 44px;
          height: 44px;
          border-radius: var(--radius-md);
          background: linear-gradient(135deg, var(--accent-gold-dim), var(--accent-gold));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          color: var(--bg-deep);
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(201, 148, 62, 0.2);
        }

        .api-query-title {
          font-family: var(--font-display);
          font-size: 1.4rem;
          font-weight: 500;
          margin: 0;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .api-query-subtitle {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 4px 0 0;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: var(--font-mono);
        }

        .history-toggle {
          padding: 10px 18px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 0.8rem;
          font-family: var(--font-mono);
          cursor: pointer;
          transition: all 0.2s var(--ease-out);
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }

        .history-toggle:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .history-toggle.active {
          background: var(--accent-gold-glow);
          border-color: var(--accent-gold-dim);
          color: var(--accent-gold-bright);
        }

        .history-icon {
          font-size: 1.1rem;
        }

        .api-query-layout {
          display: grid;
          grid-template-columns: 380px 1fr;
          min-height: 600px;
        }

        .history-panel {
          grid-column: 1 / -1;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }

        .history-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-card);
        }

        .history-panel-title {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .history-clear {
          padding: 6px 12px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.7rem;
          cursor: pointer;
          transition: all 0.2s var(--ease-out);
          font-family: var(--font-mono);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .history-clear:hover:not(:disabled) {
          border-color: var(--danger);
          color: var(--danger);
          background: var(--danger-dim);
        }

        .history-clear:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .history-list {
          max-height: 500px;
          overflow-y: auto;
          padding: 12px;
        }

        .history-empty {
          padding: 60px 20px;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-style: italic;
        }

        .history-item {
          width: 100%;
          padding: 12px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s var(--ease-out);
          text-align: left;
        }

        .history-item:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
          transform: translateX(4px);
        }

        .history-item-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .history-method {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-family: var(--font-mono);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: 1px solid;
        }

        .history-path {
          font-size: 0.8rem;
          font-family: var(--font-mono);
          color: var(--text-primary);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .history-item-bottom {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.7rem;
          font-family: var(--font-mono);
        }

        .history-time {
          color: var(--text-muted);
        }

        .history-status {
          padding: 2px 6px;
          border-radius: 3px;
          font-weight: 600;
        }

        .history-status.success {
          background: var(--success-dim);
          color: var(--success);
        }

        .history-status.error {
          background: var(--danger-dim);
          color: var(--danger);
        }

        .history-status.neutral {
          background: var(--bg-elevated);
          color: var(--text-muted);
        }

        .history-duration {
          color: var(--text-secondary);
          margin-left: auto;
        }

        .endpoint-selector {
          border-right: 1px solid var(--border);
          background: var(--bg-surface);
          overflow-y: auto;
        }

        .endpoint-selector-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-card);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .endpoint-selector-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .endpoint-count {
          font-size: 0.7rem;
          color: var(--accent-gold);
          font-family: var(--font-mono);
          background: var(--accent-gold-glow);
          padding: 3px 8px;
          border-radius: 4px;
          font-weight: 600;
        }

        .endpoint-list {
          padding: 12px;
        }

        .endpoint-item {
          width: 100%;
          padding: 12px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s var(--ease-out);
          text-align: left;
        }

        .endpoint-item:hover {
          background: var(--bg-elevated);
          border-color: var(--border-hover);
          transform: translateX(4px);
        }

        .endpoint-item.selected {
          background: var(--accent-gold-glow);
          border-color: var(--accent-gold-dim);
        }

        .endpoint-item-top {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .endpoint-method {
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-family: var(--font-mono);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: 1px solid;
          flex-shrink: 0;
        }

        .endpoint-path {
          font-size: 0.8rem;
          font-family: var(--font-mono);
          color: var(--text-primary);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .endpoint-description {
          margin: 0;
          font-size: 0.75rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .endpoint-auth-badge {
          display: inline-block;
          margin-top: 8px;
          font-size: 0.65rem;
          color: var(--accent-gold);
          font-family: var(--font-mono);
          opacity: 0.7;
        }

        .request-panel {
          padding: 24px;
          overflow-y: auto;
          background: var(--bg-deep);
        }

        .request-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 400px;
          color: var(--text-muted);
        }

        .empty-state-icon {
          font-size: 4rem;
          margin-bottom: 16px;
          opacity: 0.3;
        }

        .empty-state-title {
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin: 0 0 8px;
        }

        .empty-state-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin: 0;
        }

        .request-header {
          margin-bottom: 24px;
        }

        .request-method-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }

        .request-method-badge {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-family: var(--font-mono);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border: 1px solid;
          flex-shrink: 0;
        }

        .request-path-display {
          font-size: 1rem;
          font-family: var(--font-mono);
          color: var(--text-primary);
          font-weight: 500;
        }

        .request-description {
          margin: 0;
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .request-body-section {
          margin-bottom: 20px;
        }

        .request-path-section {
          margin-bottom: 16px;
        }

        .request-body-label {
          display: block;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin-bottom: 10px;
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .request-path-input {
          width: 100%;
          height: 44px;
          padding: 10px 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.82rem;
          transition: all 0.2s var(--ease-out);
        }

        .request-path-input:focus {
          outline: none;
          border-color: var(--accent-gold-dim);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px var(--accent-gold-glow);
        }

        .request-path-help {
          margin: 8px 0 0;
          color: var(--text-muted);
          font-size: 0.74rem;
          font-family: var(--font-mono);
        }

        .request-path-help :global(code) {
          color: var(--text-secondary);
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px 4px;
        }

        .request-body-input {
          width: 100%;
          min-height: 200px;
          padding: 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.85rem;
          line-height: 1.6;
          resize: vertical;
          transition: all 0.2s var(--ease-out);
        }

        .request-body-input:focus {
          outline: none;
          border-color: var(--accent-gold-dim);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px var(--accent-gold-glow);
        }

        .execute-btn {
          width: 100%;
          padding: 14px 20px;
          background: linear-gradient(135deg, var(--accent-gold-dim), var(--accent-gold));
          border: none;
          border-radius: var(--radius-md);
          color: var(--bg-deep);
          font-size: 0.9rem;
          font-weight: 600;
          font-family: var(--font-mono);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: all 0.3s var(--ease-out);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 4px 12px rgba(201, 148, 62, 0.25);
        }

        .execute-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, var(--accent-gold), var(--accent-gold-bright));
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(201, 148, 62, 0.35);
        }

        .execute-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .execute-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .execute-btn.loading {
          background: linear-gradient(135deg, var(--bg-elevated), var(--bg-card));
          color: var(--text-muted);
        }

        .execute-icon {
          font-size: 1rem;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .execute-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--border);
          border-top-color: var(--text-muted);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .response-section {
          margin-top: 28px;
          animation: fadeIn 0.4s var(--ease-out);
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .response-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .response-status-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .response-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-weight: 600;
          font-family: var(--font-mono);
        }

        .response-status {
          padding: 4px 10px;
          border-radius: 5px;
          font-size: 0.75rem;
          font-family: var(--font-mono);
          font-weight: 700;
        }

        .response-status.success {
          background: var(--success-dim);
          color: var(--success);
          border: 1px solid var(--success);
        }

        .response-status.error {
          background: var(--danger-dim);
          color: var(--danger);
          border: 1px solid var(--danger);
        }

        .response-status.neutral {
          background: var(--info-dim);
          color: var(--info);
          border: 1px solid var(--info);
        }

        .response-duration {
          font-size: 0.75rem;
          font-family: var(--font-mono);
          color: var(--text-secondary);
          padding: 4px 10px;
          background: var(--bg-elevated);
          border-radius: 5px;
        }

        .copy-btn {
          padding: 6px 14px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-family: var(--font-mono);
          cursor: pointer;
          transition: all 0.2s var(--ease-out);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        .copy-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--accent-gold-dim);
          color: var(--accent-gold);
        }

        .copy-btn.copied {
          background: var(--success-dim);
          border-color: var(--success);
          color: var(--success);
        }

        .response-error {
          padding: 16px;
          background: var(--danger-dim);
          border: 1px solid var(--danger);
          border-radius: var(--radius-md);
          color: var(--danger);
          font-size: 0.85rem;
          font-family: var(--font-mono);
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .error-icon {
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .response-body {
          padding: 20px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-family: var(--font-mono);
          font-size: 0.8rem;
          line-height: 1.7;
          color: var(--text-primary);
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .response-body :global(.json-key) {
          color: var(--accent-gold-bright);
        }

        .response-body :global(.json-string) {
          color: #7ba87f;
        }

        .response-body :global(.json-number) {
          color: #8a9bab;
        }

        .response-body :global(.json-boolean) {
          color: var(--warning);
        }

        .response-body :global(.json-null) {
          color: var(--text-muted);
          font-style: italic;
        }

        @media (max-width: 1024px) {
          .api-query-layout {
            grid-template-columns: 1fr;
          }

          .endpoint-selector {
            border-right: none;
            border-bottom: 1px solid var(--border);
            max-height: 300px;
          }
        }
      `}</style>
    </div>
  );
}
