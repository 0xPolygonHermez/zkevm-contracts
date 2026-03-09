#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  import_oz_info_from_tag.sh \
    --tag <git-tag> \
    --url <rpc-url>
EOF
}

# --- Long flag parsing ---
ACTUAL_DIR=$(pwd)
TAG=""
URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)           TAG="${2:-}"; shift 2 ;;
    --url)           URL="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "Unknown flag: $1"; usage; exit 1 ;;
  esac
done

# --- Validation ---
[[ -n "$TAG" ]] || { echo "Missing --tag"; usage; exit 1; }
[[ -n "$URL" ]] || { echo "Missing --url"; usage; exit 1; }

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
echo "✔ git clone"

FILE="hardhat.config.ts"
# --- Update hardhat config with importManifestNetwork chain (if it doesn't exist) ---
if ! grep -Eq '^[[:space:]]*importManifestNetwork[[:space:]]*:[[:space:]]*{' "$FILE"; then
    awk -v url="$URL" '
      /sepolia:/ && !done {
        print "        importManifestNetwork: {";
        print "            url: '\''" url "'\'',";
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

    echo "✔ Added importManifestNetwork network configuration with url: $URL"
else
    echo "✔ Custom network configuration already exists in $FILE, skipping modification."
fi

# --- Prepare manifest ---
cp "$ACTUAL_DIR/tools/importOZInfoFromTag/force_import_old_contracts.ts" ./force_import_old_contracts.ts
cp "$ACTUAL_DIR/tools/importOZInfoFromTag/import_params.json" ./import_params.json

npx hardhat run --network importManifestNetwork ./force_import_old_contracts.ts
echo "✔ force_import_old_contracts"

mkdir -p "$ACTUAL_DIR/upgrade/upgradeEtrogSovereign/manifest-from-$TAG"
cp -r ./.openzeppelin/* "$ACTUAL_DIR/upgrade/upgradeEtrogSovereign/manifest-from-$TAG"
echo "✔ copy openzeppelin"