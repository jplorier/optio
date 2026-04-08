#!/usr/bin/env bash
# check-migration-prefixes.sh — detect duplicate numeric prefixes in Drizzle migrations.
# Exits non-zero if any prefix appears more than once, except for known historical
# duplicates listed in the allowlist below.
#
# Usage: scripts/check-migration-prefixes.sh [migrations-dir]
#   migrations-dir  defaults to apps/api/src/db/migrations

set -euo pipefail

MIGRATIONS_DIR="${1:-apps/api/src/db/migrations}"

# Historical duplicate prefixes that existed on main before the timestamp-prefix
# switch. These are grandfathered in — new duplicates are blocked.
ALLOWLIST=(
  "0016"
  "0018"
  "0019"
  "0026"
  "0039"
  "0042"
)

is_allowed() {
  local prefix="$1"
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$prefix" == "$allowed" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Error: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

# Extract numeric prefixes from .sql filenames
declare -A prefix_counts
declare -A prefix_files
found_new_duplicates=0

for f in "$MIGRATIONS_DIR"/*.sql; do
  [[ -e "$f" ]] || continue
  basename=$(basename "$f")
  # Extract leading digits before the first underscore
  if [[ "$basename" =~ ^([0-9]+)_ ]]; then
    prefix="${BASH_REMATCH[1]}"
    prefix_counts[$prefix]=$(( ${prefix_counts[$prefix]:-0} + 1 ))
    prefix_files[$prefix]="${prefix_files[$prefix]:-}  $basename"$'\n'
  fi
done

for prefix in "${!prefix_counts[@]}"; do
  count="${prefix_counts[$prefix]}"
  if (( count > 1 )); then
    if is_allowed "$prefix"; then
      # Historical duplicate — skip
      continue
    fi
    echo "ERROR: Duplicate migration prefix '$prefix' found ($count files):" >&2
    echo "${prefix_files[$prefix]}" >&2
    found_new_duplicates=1
  fi
done

if (( found_new_duplicates )); then
  echo "" >&2
  echo "New duplicate migration prefixes are not allowed." >&2
  echo "Use 'migrations.prefix: \"unix\"' in drizzle.config.ts to generate timestamp-based prefixes." >&2
  exit 1
fi

echo "Migration prefix check passed — no new duplicates found."
exit 0
