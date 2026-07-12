# Secrets Policy

> Status: Active security policy
>
> Audience: Maintainers and deployment operators
>
> Last verified: 2026-07-11 against `AGENTS.md` and `Jenkinsfile`

This repository must not contain live credentials. It may contain only
obviously non-secret examples and templates.

## Runtime Source

Jenkins loads the current app and worker environments from:

- `/home/semyon/jenkins/env/oghma-dev.env`
- `/home/semyon/jenkins/env/oghma-prod.env`

Those files are deployment inputs, not files to copy into this repository.
Persistent-stack secrets and recovery procedures belong to the private
`server-stacks` repository. Its authoritative document is
`server-stacks/docs/security/SECRETS.md`.

Do not duplicate password-vault recovery steps, secret values, or private
inventory in this public/application repository.

## Handling Rules

- Do not print, paste, log, summarize, or screenshot secret values.
- Do not open a runtime env file merely to discover which variables exist; use
  the tracked templates first.
- Do not ask an agent to search a password manager or private env files without
  explicit task-specific authorization.
- Never commit filled `.env` files, API responses containing credentials,
  database dumps, cookies, OAuth tokens, Canvas tokens, or private keys.
- Use the least-privileged credential for each service and environment.
- Keep development and production credentials separate.
- Treat pre-authenticated object-storage and Canvas download URLs as secrets
  until they expire.
- Redact values from terminal output, CI logs, support tickets, and incident
  notes.

## File Protection

Runtime env files should be owned by the deployment account and readable only
by the minimum required principal. The expected file mode is `0600`, with
parent directories restricted appropriately.

Permission checks may inspect path, owner, group, and mode only. They must not
read file contents. Fix permissive modes through the private operations
workflow and confirm that Jenkins can still read the files afterward.

## Adding or Changing a Variable

1. Add a blank or clearly fake entry to the appropriate tracked example or
   template.
2. Document its purpose without giving a real value or derivation recipe.
3. Add the real value through the private deployment workflow.
4. Ensure the app and worker receive the same value when both need it.
5. Deploy to development and exercise the affected path.
6. Confirm logs and error messages do not expose the value.
7. Promote through the normal `dev` to `main` flow.
8. Update the private source-of-truth record after successful rotation.

Do not make an application repository commit depend on retrieving a specific
secret from a named password-vault item.

## Rotation

Rotate a credential when:

- it appears in Git history, logs, chat, screenshots, tickets, or build output;
- a device, account, or collaborator with access is lost or removed;
- provider scope changes;
- the provider reports compromise or suspicious use;
- the private runbook's scheduled rotation policy requires it.

For a coordinated rotation:

1. Identify every consumer without printing the old value.
2. Create a least-privileged replacement.
3. update private runtime configuration;
4. redeploy and verify the affected integration;
5. revoke the old credential;
6. verify that rollback instructions do not restore the revoked value;
7. record the rotation in the private audit trail.

If a committed secret is discovered, removing the current line is not enough.
Revoke it first, then follow the private incident procedure for history and
artifact cleanup.

## Review Checklist

- Tracked files contain placeholders only.
- Runtime paths match `AGENTS.md` and `Jenkinsfile`.
- Runtime env permissions are restricted.
- Dev and production use different credentials where supported.
- Tokens have only the permissions required by their consumer.
- Logs, tests, fixtures, and error responses contain no secret values.
- The private `server-stacks` runbook remains the sole recovery source.
- Retired credentials are revoked, not merely unused.
