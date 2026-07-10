"use client";

// Catches errors in the root layout itself, so it must render its own
// <html>/<body> and can't rely on globals.css (the layout is bypassed).
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0a0a0a",
          color: "#ededed",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#888", marginTop: 8 }}>A critical error occurred.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              cursor: "pointer",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#ededed",
              color: "#0a0a0a",
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
