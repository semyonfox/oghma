// Simple API route that returns server time and a random number

export async function GET() {
  const now = new Date();
  const payload = {
    ok: true,
    message: "Hello from /api/time",
    time: now.toISOString(),
    random: Math.random(),
  };

  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

