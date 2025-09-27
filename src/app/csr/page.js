"use client";

import { useState, useEffect } from "react";

export default function CSRPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [count, setCount] = useState(0);

    // Fetch on the client (runs in browser only)
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const res = await fetch("/api/time", { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (err) {
                if (!cancelled) setError(String(err));
            }
        }
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <div style={{ padding: 24 }}>
            <h1>CSR Demo</h1>
            <p>This page fetches data from <code>/api/time</code> in the browser using <code>fetch</code>.</p>

            <section style={{ marginTop: 16 }}>
                <h2>Result</h2>
                {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
                {!data && !error && <p>Loading…</p>}
                {data && (
                    <pre style={{ background: "#4f4f4f", padding: 12, borderRadius: 6 }}>
{JSON.stringify(data, null, 2)}
                    </pre>
                )}
            </section>

            <section style={{ marginTop: 16 }}>
                <h2>Client counter</h2>
                <p>Count: {count}</p>
                <button className="btn btn-outline-light" onClick={() => setCount(c => c + 1)}>Increment</button>
            </section>

            <p style={{ marginTop: 24, color: "#555" }}>
                Note: We use the native <code>fetch</code> API for simplicity. As the app grows and you need features like request cancellation, interceptors, retries, or broader browser support, consider switching to Axios.
            </p>
        </div>
    );
}
