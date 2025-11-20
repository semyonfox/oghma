# Configuration Overview

This file summarizes the production configuration choices. For live, up-to-date instructions, use the other docs.

## Database

- Container: `pg-db-ct2106`
- Internal IP: `172.30.10.5`
- Port: `5432`
- Database: `ct2106`
- User: `socsboard_user`
- Connection string: `postgresql://socsboard_user:…@pg-db-ct2106:5432/ct2106`

All current env templates (`.env`, `.env.example`, `.env.production.template`) are aligned to this internal Docker
network setup.

## Docker & network

- Service name: `ct216_web`
- Network: external Docker network `ct2106`
- IP address: `172.30.10.8`
- Health check: `/api/health`

## Cloudflare Tunnel

- Public hostname: `your-domain.com`
- Target service: `http://172.30.10.8:3000`
- Token-based tunnel; the current token and options live in `docs/CLOUDFLARE_TUNNEL.md`.

## Where to go next

- Quick deployment: `docs/QUICKSTART.md`
- Full deployment details: `docs/DEPLOYMENT.md`
- Checklist-style sign-off: `DEPLOYMENT_CHECKLIST.md`
- Local/dev vs prod split: `SETUP.md`

Treat this file as a reference snapshot; if you change database hosts, users, or network layout, update this summary and
then adjust the referenced docs and env templates accordingly.
