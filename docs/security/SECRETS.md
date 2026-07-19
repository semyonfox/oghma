# Secrets

The `oghma` application repo should not contain live runtime secrets. Production
and dev env files are managed from `server-stacks`; this repo should keep only
examples or templates.

## Where They Are On This Device

Runtime/deployment secrets are in `server-stacks`:

```sh
/home/semyon/code/personal/server-stacks/oghma/.env.dev
/home/semyon/code/personal/server-stacks/oghma/.env.prod
/home/semyon/code/personal/server-stacks/oghma/stack.env
/home/semyon/code/personal/server-stacks/jenkins/env/oghma-dev.env
/home/semyon/code/personal/server-stacks/jenkins/env/oghma-prod.env
```

The live/deploy copy may also exist here:

```sh
/home/semyon/server-stacks/oghma/.env.dev
/home/semyon/server-stacks/oghma/.env.prod
/home/semyon/server-stacks/jenkins/env/oghma-dev.env
/home/semyon/server-stacks/jenkins/env/oghma-prod.env
```

This repo may have local ignored env files for development, but they are not the
source of truth.

## How To Get A Secret

Read the ignored local env file in `server-stacks`:

```sh
grep '^DATABASE_URL=' /home/semyon/code/personal/server-stacks/oghma/.env.prod
grep '^GOOGLE_SECRET=' /home/semyon/code/personal/server-stacks/jenkins/env/oghma-prod.env
grep '^COHERE_API_KEY=' /home/semyon/code/personal/server-stacks/oghma/.env.prod
```

For local development:

```sh
cp .env.example .env.local
```

Then fill only the values required for the task from `server-stacks` or the
password vault.

## Bitwarden CLI

Bitwarden Cloud server:

```text
https://vault.bitwarden.com
```

If the account is on Bitwarden EU Cloud instead, use
`https://vault.bitwarden.eu`.

Bitwarden CLI local app data on this Linux device is stored here by default:

```text
~/.config/Bitwarden CLI
```

Install and unlock the CLI:

```sh
npm install -g @bitwarden/cli
bw config server https://vault.bitwarden.com
bw login
export BW_SESSION="$(bw unlock --raw)"
bw sync
```

If `bw` is already configured, check it first:

```sh
bw config server
```

Bitwarden Cloud items for `oghma`:

```text
server-stacks / oghma prod env          -> /home/semyon/code/personal/server-stacks/oghma/.env.prod
server-stacks / oghma dev env           -> /home/semyon/code/personal/server-stacks/oghma/.env.dev
server-stacks / oghma prod jenkins env  -> /home/semyon/code/personal/server-stacks/jenkins/env/oghma-prod.env
server-stacks / oghma dev jenkins env   -> /home/semyon/code/personal/server-stacks/jenkins/env/oghma-dev.env
```

Restore from Bitwarden Cloud to the ignored local files:

```sh
umask 077
bw get notes 'server-stacks / oghma prod env' > /home/semyon/code/personal/server-stacks/oghma/.env.prod
bw get notes 'server-stacks / oghma dev env' > /home/semyon/code/personal/server-stacks/oghma/.env.dev
bw get notes 'server-stacks / oghma prod jenkins env' > /home/semyon/code/personal/server-stacks/jenkins/env/oghma-prod.env
bw get notes 'server-stacks / oghma dev jenkins env' > /home/semyon/code/personal/server-stacks/jenkins/env/oghma-dev.env
```

Store updates with `bw edit item` from the canonical instructions in
`server-stacks/docs/security/SECRETS.md`. These are `bw` Password Manager
Secure Notes, not `bws` Secrets Manager entries.

## Rules

- Do not commit `.env*` files except examples and templates.
- Test password fixtures are not credentials; keep them obviously fake.
- Rotate OAuth, database, AWS/S3/SES, and AI-provider keys if they were exposed.
