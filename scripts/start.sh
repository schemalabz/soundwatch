#!/bin/sh
set -e

echo "Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy

# Continuous aggregates cannot live in a Prisma migration (no transactions).
# Idempotent, and safe to lose the race with the ingester.
echo "Ensuring TimescaleDB objects..."
node timescale-objects.cjs

echo "Starting application..."
exec node server.js
