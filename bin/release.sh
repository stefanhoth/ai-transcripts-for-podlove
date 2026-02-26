#!/usr/bin/env bash
# Build a plugin zip, create a git tag, and publish a GitHub release.
#
# Usage: bin/release.sh [patch|minor|major]
#
# When a bump type (patch, minor, major) is supplied the script will:
#   1. Bump the version in the plugin PHP file and package.json
#   2. Update CHANGELOG.md via auto-changelog (if npx is available)
#   3. Commit those changes before tagging
#
# Without a bump type the script releases whatever version is already
# in the plugin file, which must already be committed (clean working tree).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_SLUG="ai-transcripts-for-podlove"

# ── Optional version bump ──────────────────────────────────────────────────────
BUMP_TYPE=""
for arg in "$@"; do
    case "$arg" in
        patch|minor|major) BUMP_TYPE="$arg" ;;
        *) echo "Unknown argument: $arg" >&2; echo "Usage: $(basename "$0") [patch|minor|major]" >&2; exit 1 ;;
    esac
done

if [[ -n "$BUMP_TYPE" ]]; then
    echo "=== Bumping version ($BUMP_TYPE) ==="
    NEW_VERSION=$("$SCRIPT_DIR/bump-version.sh" "$BUMP_TYPE")

    # Update CHANGELOG.md if auto-changelog is available
    if command -v npx >/dev/null 2>&1; then
        echo "=== Updating CHANGELOG.md ==="
        (cd "$REPO_DIR" && npx --yes auto-changelog --package) \
            || echo "Warning: auto-changelog failed, CHANGELOG.md not updated."
    else
        echo "Warning: npx not found, skipping CHANGELOG.md update." >&2
    fi

    # Commit the version bump (and changelog if updated)
    git -C "$REPO_DIR" add "$PLUGIN_SLUG.php" package.json
    [[ -f "$REPO_DIR/CHANGELOG.md" ]] && git -C "$REPO_DIR" add CHANGELOG.md
    git -C "$REPO_DIR" commit -m "chore: bump version to $NEW_VERSION"
    echo "Committed version bump to $NEW_VERSION"
fi

# ── Extract version ────────────────────────────────────────────────────────────
VERSION=$(sed -n "s/.*define( *'AI_TRANSCRIPTS_VERSION' *, *'\([^']*\)'.*/\1/p" "$REPO_DIR/$PLUGIN_SLUG.php")

if [[ -z "$VERSION" ]]; then
    echo "Error: could not extract version from $PLUGIN_SLUG.php" >&2
    exit 1
fi

TAG="v$VERSION"
ZIP_NAME="plugin-${PLUGIN_SLUG}-${TAG}.zip"
DIST_DIR="$REPO_DIR/dist"
BUILD_DIR=$(mktemp -d)

echo "=== Building $ZIP_NAME ==="

mkdir -p "$DIST_DIR"

# Copy essential plugin files into a staging directory
mkdir -p "$BUILD_DIR/$PLUGIN_SLUG"

cp "$REPO_DIR/$PLUGIN_SLUG.php"  "$BUILD_DIR/$PLUGIN_SLUG/"
cp -r "$REPO_DIR/inc"            "$BUILD_DIR/$PLUGIN_SLUG/"
cp -r "$REPO_DIR/assets"         "$BUILD_DIR/$PLUGIN_SLUG/"
cp -r "$REPO_DIR/languages"      "$BUILD_DIR/$PLUGIN_SLUG/"

# Include optional distribution files when present
for f in README.md CHANGELOG.md readme.txt; do
    [[ -f "$REPO_DIR/$f" ]] && cp "$REPO_DIR/$f" "$BUILD_DIR/$PLUGIN_SLUG/" && echo "  + $f"
done

# Remove macOS metadata files
find "$BUILD_DIR" -name '.DS_Store' -delete

# Create the zip
(cd "$BUILD_DIR" && zip -rq "$DIST_DIR/$ZIP_NAME" "$PLUGIN_SLUG")

rm -rf "$BUILD_DIR"

echo "Created dist/$ZIP_NAME"

# ── Guard: no uncommitted changes ──────────────────────────────────────────────
if ! git -C "$REPO_DIR" diff --quiet HEAD; then
    echo "Error: you have uncommitted changes. Commit or stash them before releasing." >&2
    exit 1
fi

# ── Tag ────────────────────────────────────────────────────────────────────────
if git -C "$REPO_DIR" rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Tag $TAG already exists — skipping tag creation."
else
    echo "Creating tag $TAG ..."
    git -C "$REPO_DIR" tag -a "$TAG" -m "Release $TAG"
    git -C "$REPO_DIR" push origin "$TAG"
fi

# ── GitHub release ─────────────────────────────────────────────────────────────
echo "Creating GitHub release $TAG ..."

gh release create "$TAG" \
    --repo "$(git -C "$REPO_DIR" remote get-url origin)" \
    --title "$TAG" \
    --generate-notes \
    "$DIST_DIR/$ZIP_NAME"

echo "Done! Release $TAG published with $ZIP_NAME"
