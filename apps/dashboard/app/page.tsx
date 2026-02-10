export default function DashboardHomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "720px",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h1 style={{ margin: 0, marginBottom: "12px", fontSize: "28px" }}>
          SlugSwap Dashboard
        </h1>
        <p style={{ margin: 0, color: "#4b5563", lineHeight: 1.6 }}>
          Dashboard scaffold is ready in <code>apps/dashboard</code>. Next step
          is migrating API routes into <code>apps/dashboard/app/api</code> so
          this app can own the backend on Vercel.
        </p>
      </section>
    </main>
  );
}
