#!/bin/bash
# Start Canvas Import Worker with environment loaded

set -a
source .env
source .env.local 2>/dev/null || true
set +a

exec npm run worker "$@"
