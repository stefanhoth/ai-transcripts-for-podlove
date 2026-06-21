#!/usr/bin/env bash
# Bumps the plugin version according to semantic versioning.
#
# Usage: bin/bump-version.sh [patch|minor|major]
# Default: patch
#
# Updates:
#   - Version header in the main plugin PHP file
#   - AI_TRANSCRIPTS_VERSION constant in the main plugin PHP file
#   - version field in package.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_SLUG="ai-transcripts-for-podlove"
PLUGIN_FILE="$REPO_DIR/$PLUGIN_SLUG.php"
PACKAGE_FILE="$REPO_DIR/package.json"

BUMP_TYPE="${1:-patch}"

case "$BUMP_TYPE" in
    patch|minor|major) ;;
    *)
        echo "Usage: $(basename "$0") [patch|minor|major]" >&2
        echo "Default bump type is 'patch'." >&2
        exit 1
        ;;
esac

# Extract current version from the PHP constant (source of truth)
CURRENT=$(sed -n "s/.*define( *'AI_TRANSCRIPTS_VERSION' *, *'\([^']*\)'.*/\1/p" "$PLUGIN_FILE")

if [[ -z "$CURRENT" ]]; then
    echo "Error: could not read AI_TRANSCRIPTS_VERSION from $PLUGIN_FILE" >&2
    exit 1
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$BUMP_TYPE" in
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    patch) PATCH=$((PATCH + 1)) ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "Bumping $CURRENT → $NEW ($BUMP_TYPE)" >&2

# Update the Version: header in the plugin doc-block
# Matches lines like:  * Version: 1.0.10
perl -i -pe "s{^( \* Version:\s*)${CURRENT}\$}{\${1}${NEW}}" "$PLUGIN_FILE"

# Update the PHP constant
# Matches: define('AI_TRANSCRIPTS_VERSION', '1.0.10')  (spaces around ( are tolerated)
perl -i -pe "s{define\(\s*'AI_TRANSCRIPTS_VERSION'\s*,\s*'${CURRENT}'\)}{define('AI_TRANSCRIPTS_VERSION', '${NEW}')}" "$PLUGIN_FILE"

# Update package.json using node if available, otherwise fall back to perl
if command -v node >/dev/null 2>&1; then
    node - "$PACKAGE_FILE" "$NEW" <<'EOF'
const fs = require('fs');
const [,, file, ver] = process.argv;
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = ver;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.error('Updated package.json version to ' + ver);
EOF
else
    perl -i -pe "s{(\"version\":\s*)\"${CURRENT}\"}{\${1}\"${NEW}\"}" "$PACKAGE_FILE"
fi

# Print the new version so callers can capture it
echo "$NEW"
