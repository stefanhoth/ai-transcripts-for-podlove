#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_SLUG="ai-transcripts-for-podlove"

# Extract version from main plugin file
VERSION=$(sed -n "s/.*define( *'AI_TRANSCRIPTS_VERSION' *, *'\([^']*\)'.*/\1/p" "$REPO_DIR/$PLUGIN_SLUG.php")

if [[ -z "$VERSION" ]]; then
    echo "Error: could not extract version from $PLUGIN_SLUG.php" >&2
    exit 1
fi

TAG="v$VERSION"
ZIP_NAME="plugin-${PLUGIN_SLUG}-${TAG}.zip"
DIST_DIR="$REPO_DIR/dist"
BUILD_DIR=$(mktemp -d)

echo "Building $ZIP_NAME ..."

mkdir -p "$DIST_DIR"

# Copy essential plugin files into a staging directory
mkdir -p "$BUILD_DIR/$PLUGIN_SLUG"

cp "$REPO_DIR/$PLUGIN_SLUG.php" "$BUILD_DIR/$PLUGIN_SLUG/"
cp "$REPO_DIR/README.md"        "$BUILD_DIR/$PLUGIN_SLUG/" 2>/dev/null || true

cp -r "$REPO_DIR/inc"       "$BUILD_DIR/$PLUGIN_SLUG/"
cp -r "$REPO_DIR/assets"    "$BUILD_DIR/$PLUGIN_SLUG/"
cp -r "$REPO_DIR/languages" "$BUILD_DIR/$PLUGIN_SLUG/"

# Remove macOS metadata files
find "$BUILD_DIR" -name '.DS_Store' -delete

# Create the zip
(cd "$BUILD_DIR" && zip -rq "$DIST_DIR/$ZIP_NAME" "$PLUGIN_SLUG")

rm -rf "$BUILD_DIR"

echo "Created dist/$ZIP_NAME"

# Check for uncommitted changes
if ! git -C "$REPO_DIR" diff --quiet HEAD; then
    echo "Warning: you have uncommitted changes. Commit before releasing." >&2
    exit 1
fi

# Create tag if it doesn't exist
if git -C "$REPO_DIR" rev-parse "$TAG" >/dev/null 2>&1; then
    echo "Tag $TAG already exists."
else
    echo "Creating tag $TAG ..."
    git -C "$REPO_DIR" tag -a "$TAG" -m "Release $TAG"
    git -C "$REPO_DIR" push origin "$TAG"
fi

# Create GitHub release and upload the zip
echo "Creating GitHub release $TAG ..."
gh release create "$TAG" \
    --repo "$(git -C "$REPO_DIR" remote get-url origin)" \
    --title "$TAG" \
    --generate-notes \
    --notes "" \
    "$DIST_DIR/$ZIP_NAME"

echo "Done! Release $TAG published with $ZIP_NAME"
