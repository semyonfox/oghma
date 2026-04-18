// loads secrets from AWS Secrets Manager at cold-start and patches process.env
// SECRETS_ID can be a comma-separated list of secret names/ARNs
// keys are normalized to UPPERCASE so snake_case secrets work (e.g. database_url → DATABASE_URL)
// no-op when SECRETS_ID is unset (local dev continues using .env.local as-is)

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export async function loadSecrets(): Promise<void> {
  const raw = process.env.SECRETS_ID ?? "";
  const secretIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (secretIds.length === 0) return;

  const region = process.env.AWS_REGION ?? "eu-west-1";
  const client = new SecretsManagerClient({ region });

  for (const secretId of secretIds) {
    const res = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    if (!res.SecretString) continue;

    const secrets = JSON.parse(res.SecretString) as Record<string, string>;
    for (const [key, value] of Object.entries(secrets)) {
      process.env[key.toUpperCase()] = value;
    }
  }
}
