#!/usr/bin/env bash
# Formats edited TS/JS/JSON/MD files with Prettier once the project has it installed.
f=$(jq -r '.tool_input.file_path // empty')
[ -z "$f" ] && exit 0
case "$f" in *.ts|*.tsx|*.js|*.jsx|*.json|*.css) ;; *) exit 0 ;; esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -x node_modules/.bin/prettier ] && node_modules/.bin/prettier --write "$f" >/dev/null 2>&1
exit 0
