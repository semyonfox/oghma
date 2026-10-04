import { androidAppLinkFingerprints } from "@/lib/mobile-auth";

export function GET() {
  const fingerprints = androidAppLinkFingerprints();
  if (!fingerprints.length)
    return Response.json(
      { error: "Android association is not configured" },
      { status: 503 },
    );
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "ie.oghmanotes.alpha",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
