#!/usr/bin/env bash
# Usage:
#   ./scripts/release.sh [major|minor|patch]      — bump and release (interactive)
#   ./scripts/release.sh [major|minor|patch] -y   — bump and release (non-interactive)
#   ./scripts/release.sh --tag v1.2.3             — redeploy an existing tag
set -e

# Parse -y / --yes flag from any position
YES=false
ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "-y" || "$arg" == "--yes" ]]; then
    YES=true
  else
    ARGS+=("$arg")
  fi
done
set -- "${ARGS[@]}"

# Must be run from repo root
if [ ! -f "firebase.json" ]; then
  echo "error: run from repo root" && exit 1
fi

# ── Redeploy existing tag ─────────────────────────────────────────────────────
if [ "$1" = "--tag" ]; then
  TAG="$2"
  if [ -z "$TAG" ]; then
    echo "error: --tag requires a version, e.g. --tag v1.2.3" && exit 1
  fi
  if ! git tag | grep -qx "$TAG"; then
    echo "error: tag $TAG does not exist" && exit 1
  fi
  echo ""
  echo "  Redeploying $TAG"
  if [[ "$YES" != "true" ]]; then
    read -p "  Push $TAG to trigger deploy? [y/N] " CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
      echo "aborted" && exit 0
    fi
  fi
  git push -f origin "$TAG"
  echo ""
  echo "  Deploy triggered — watch CI at https://github.com/ashinsabu/cumin/actions"
  exit 0
fi

# ── New release ───────────────────────────────────────────────────────────────
BUMP="${1:-patch}"

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
if [[ "$YES" != "true" ]]; then
  read -p "  Tag and push $NEXT? [y/N] " CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "aborted" && exit 0
  fi
fi

TAG_MSG=$(printf "%s\n\n%s" "$NEXT" "$CHANGELOG")
git tag "$NEXT" -m "$TAG_MSG"
git push origin "$NEXT"

echo ""
echo "  Released $NEXT — watch CI at https://github.com/ashinsabu/cumin/actions"
