import { headers } from "next/headers";
import Counter from "./Counter";

export default async function SSRPage() {
    const hdrs = headers();
    const host = hdrs.get("host");
    const fwdProto = hdrs.get("x-forwarded-proto");
    const protocol = (fwdProto?.split(",")[0] || "http" );

    // Server-side fetch to the API
    const res = await fetch(`${protocol}://${host}/api/time`, { cache: "no-store" });
    const data = await res.json();

    return (
        <div style={{ padding: 24 }}>
            <h1>SSR Demo</h1>
            <p>This page fetches data from <code>/api/time</code> on the server before rendering.</p>

            <section style={{ marginTop: 16 }}>
                <h2>Result</h2>
                <pre style={{ background: "#4f4f4f", padding: 12, borderRadius: 6 }}>
{JSON.stringify(data, null, 2)}
                </pre>
            </section>

            <section style={{ marginTop: 16 }}>
                <h2>Client counter (island)</h2>
                <Counter />
            </section>
        </div>
    );
}
