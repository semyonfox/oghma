import { getBaseUrl } from "@/lib/public/agent-content";

export function GET() {
  const baseUrl = getBaseUrl();
  return Response.json(
    {
      resource: baseUrl,
      resource_name: "OghmaNotes",
      authorization_servers: [baseUrl],
      scopes_supported: [],
      bearer_methods_supported: [],
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
