export default function ApiIndexPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>API Index</h1>
      <p>This project exposes a simple demo API endpoint.</p>
      <ul>
        <li>
          <a href="/api/time">GET /api/time</a> — returns server time and a random number
        </li>
      </ul>
      <p>
        Tip: The CSR and SSR demo pages both call this endpoint using <code>fetch</code>.
      </p>
    </main>
  );
}
