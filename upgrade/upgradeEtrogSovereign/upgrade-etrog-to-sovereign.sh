#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  upgrade-etrog-to-sovereign.sh \
    --old-tag <git-tag> \
EOF
}

# --- Long flag parsing ---
ACTUAL_DIR=$(pwd)
TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --old-tag)       TAG="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "Unknown flag: $1"; usage; exit 1 ;;
  esac
done

# --- Validation tag ---
[[ -n "$TAG" ]] || { echo "Missing --tag"; usage; exit 1; }

# --- Prepare manifest ---
./upgrade/upgradeEtrogSovereign/prepare-manifest.sh \
  --tag $TAG \

# --- Copy manifest ---
cp ./upgrade/upgradeEtrogSovereign/manifest-from-$TAG/* ./.openzeppelin

# --- Upgrade script ---
npx hardhat run ./upgrade/upgradeEtrogSovereign/upgradeEtrogToSovereign.ts --network custom