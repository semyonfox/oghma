// Api logic will go in here

// quick example to return server time
export async function GET(request) {
    const serverTime = new Date().toISOString();
    return new Response(JSON.stringify({ time: serverTime }), {
        headers: { 'Content-Type': 'application/json' },
    });
}