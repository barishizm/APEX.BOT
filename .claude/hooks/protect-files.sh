#!/usr/bin/env bash
# Blocks edits to secret env files and lock files. .env.example is allowed.
f=$(jq -r '.tool_input.file_path // empty')
[ -z "$f" ] && exit 0
base=$(basename "$f")
case "$base" in
  .env.example) exit 0 ;;
  .env|.env.*|pnpm-lock.yaml|package-lock.json|yarn.lock)
    echo "Blocked: $base is protected (secrets/lock file). Edit it manually if intended." >&2
    exit 2 ;;
esac
exit 0
