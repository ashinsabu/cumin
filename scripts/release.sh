#!/usr/bin/env bash
# Usage: ./scripts/release.sh [major|minor|patch]
set -e

BUMP="${1:-patch}"

# Must be run from repo root
if [ ! -f "firebase.json" ]; then
  echo "error: run from repo root" && exit 1
fi

# Must be on main, no uncommitted changes
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "error: must be on main (currently on $BRANCH)" && exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: uncommitted changes — commit or stash first" && exit 1
fi

# Pull latest
git pull --ff-only origin main

# Get latest tag (default to v0.0.0 if none)
LATEST=$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
LATEST="${LATEST:-v0.0.0}"

# Parse semver
IFS='.' read -r MAJOR MINOR PATCH <<< "${LATEST#v}"

case "$BUMP" in
  major) MAJOR=$((MAJOR+1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR+1)); PATCH=0 ;;
  patch) PATCH=$((PATCH+1)) ;;
  *)     echo "error: bump must be major, minor, or patch" && exit 1 ;;
esac

NEXT="v${MAJOR}.${MINOR}.${PATCH}"

# Build changelog from commits since last tag
if [ "$LATEST" = "v0.0.0" ]; then
  CHANGELOG=$(git log --pretty=format:"- %s" | head -20)
else
  CHANGELOG=$(git log "${LATEST}..HEAD" --pretty=format:"- %s")
fi

if [ -z "$CHANGELOG" ]; then
  echo "error: no commits since $LATEST — nothing to release" && exit 1
fi

# Show preview
echo ""
echo "  Current: $LATEST"
echo "  Next:    $NEXT"
echo ""
echo "  Changelog:"
echo "$CHANGELOG" | sed 's/^/    /'
echo ""
read -p "  Tag and push $NEXT? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "aborted" && exit 0
fi

TAG_MSG=$(printf "%s\n\n%s" "$NEXT" "$CHANGELOG")
git tag "$NEXT" -m "$TAG_MSG"
git push origin "$NEXT"

echo ""
echo "  Released $NEXT — watch CI at https://github.com/ashinsabu/cumin/actions"
