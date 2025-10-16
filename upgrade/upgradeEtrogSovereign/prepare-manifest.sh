#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  prepare-manifest.sh \
    --tag <git-tag> \
EOF
}

# --- Long flag parsing ---
ACTUAL_DIR=$(pwd)
TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)           TAG="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "Unknown flag: $1"; usage; exit 1 ;;
  esac
done

# --- Validation ---
[[ -n "$TAG" ]] || { echo "Missing --tag"; usage; exit 1; }

# --- Temporary workspace + cleanup ---
WORKDIR="$(mktemp -d -t agglayer-contracts-XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

# --- Clone, install, and compile ---
git clone git@github.com:agglayer/agglayer-contracts.git "$WORKDIR/agglayer-contracts"
cd "$WORKDIR/agglayer-contracts"
git checkout "$TAG"
npm i
npx hardhat compile

FILE="hardhat.config.ts"
# --- Update hardhat config with custom chain (if it doesn't exist) ---
if ! grep -Eq '^[[:space:]]*custom[[:space:]]*:[[:space:]]*{' "$FILE"; then
    awk '
      /sepolia:/ && !done {
        print "        custom: {";
        print "            url: process.env.CUSTOM_PROVIDER ? process.env.CUSTOM_PROVIDER : '\''http://127.0.0.1:8545'\'',";
        print "            accounts: {";
        print "                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,";
        print "                path: \"m/44'\''/60'\''/0'\''/0\",";
        print "                initialIndex: 0,";
        print "                count: 20,";
        print "            },";
        print "        },";
        print $0;
        done=1;
        next
      }
      { print $0 }
    ' "$FILE" > tmp && mv tmp "$FILE"

    echo "Added custom network configuration to $FILE"
else
    echo "Custom network configuration already exists in $FILE, skipping modification."
fi

# --- Create .env for custom network ---
cp "$ACTUAL_DIR/.env" ./.env

# --- Prepare manifest ---
cp "$ACTUAL_DIR/upgrade/upgradeEtrogSovereign/force-import-old-contracts.ts" ./force-import-old-contracts.ts
cp "$ACTUAL_DIR/upgrade/upgradeEtrogSovereign/upgrade_parameters.json" ./upgrade_parameters.json

npx hardhat run --network custom ./force-import-old-contracts.ts

cp -r ./.openzeppelin "$ACTUAL_DIR/upgrade/upgradeEtrogSovereign/manifest-from-$TAG"