/*
 * OpenWebUI token manager
 * Session JWTs expire every 24h — this refreshes automatically on 401
 * Credentials stored in env, never in code
 */

let cachedToken: string | null = null;

export async function getOpenWebUIToken(): Promise<string> {
    if (cachedToken) return cachedToken;

    const res = await fetch(`${process.env.LLM_API_URL}/api/v1/auths/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: process.env.OPENWEBUI_EMAIL,
            password: process.env.OPENWEBUI_PASSWORD,
        }),
    });

    if (!res.ok) throw new Error(`OpenWebUI auth failed: ${res.status}`);
    const data = await res.json();
    cachedToken = data.token;
    return cachedToken!;
}

export function invalidateToken() {
    cachedToken = null;
}
