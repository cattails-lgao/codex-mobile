#!/usr/bin/env bash
set -euo pipefail

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

package_name=$(node -p "require('./package.json').name")
current_version=$(node -p "require('./package.json').version")
published_version=$(npm view "$package_name" version 2>/dev/null || true)

if [[ -n "$published_version" ]]; then
  next_version=$(node -e "
const current = process.argv[1].split('.').map(Number);
const published = process.argv[2].split('.').map(Number);
const base = published[0] === current[0] && published[1] === current[1] && published[2] === current[2]
  ? published
  : current;
base[2] += 1;
console.log(base.join('.'));
" "$current_version" "$published_version")
else
  next_version=$(node -e "
const parts = process.argv[1].split('.').map(Number);
parts[2] += 1;
console.log(parts.join('.'));
" "$current_version")
fi

if [[ "$next_version" != "$current_version" ]]; then
  npm version "$next_version" --no-git-tag-version
fi

npm run build
npm publish --access public
