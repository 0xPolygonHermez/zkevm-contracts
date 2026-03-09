#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  upgrade_etrog_to_sovereign.sh \
    --old-tag <git-tag> \
    --url <rpc-url> \
    [--lbt-path <path-to-lbt-json>]
EOF
}

# --- Long flag parsing ---
ACTUAL_DIR=$(pwd)
TAG=""
URL=""
LBT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --old-tag)       TAG="${2:-}"; shift 2 ;;
    --url)           URL="${2:-}"; shift 2 ;;
    --lbt-path)      LBT_PATH="${2:-}"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *) echo "Unknown flag: $1"; usage; exit 1 ;;
  esac
done

# --- Validation ---
[[ -n "$TAG" ]] || { echo "Missing --old-tag"; usage; exit 1; }
[[ -n "$URL" ]] || { echo "Missing --url"; usage; exit 1; }

# --- Create import_params.json from upgrade_parameters.json ---
UPGRADE_PARAMS="./upgrade/upgradeEtrogSovereign/upgrade_parameters.json"
IMPORT_PARAMS="./tools/importOZInfoFromTag/import_params.json"

BRIDGE_L2_ADDRESS=$(jq -r '.bridgeL2Address' "$UPGRADE_PARAMS")
[[ -n "$BRIDGE_L2_ADDRESS" && "$BRIDGE_L2_ADDRESS" != "null" ]] || { echo "Missing bridgeL2Address in $UPGRADE_PARAMS"; exit 1; }

if [[ -f "$IMPORT_PARAMS" ]]; then
    echo "⚠ Overwriting existing $IMPORT_PARAMS"
fi

cat > "$IMPORT_PARAMS" <<EOF
{
    "bridgeL2Address": "$BRIDGE_L2_ADDRESS"
}
EOF
echo "✔ Created $IMPORT_PARAMS with bridgeL2Address: $BRIDGE_L2_ADDRESS"

# --- Prepare manifest ---
./tools/importOZInfoFromTag/import_oz_info_from_tag.sh \
  --tag $TAG \
  --url $URL

# --- Copy manifest ---
mkdir -p ./.openzeppelin
cp ./upgrade/upgradeEtrogSovereign/manifest-from-$TAG/* ./.openzeppelin/
echo "✔ Copy manifest"

# --- Upgrade script ---
UPGRADE_CMD="npx hardhat run ./upgrade/upgradeEtrogSovereign/upgradeEtrogToSovereign.ts --network custom"
if $UPGRADE_CMD; then
    echo "✔ Upgrade done!"
else
    echo ""
    echo "❌ Upgrade script failed. Please retry using the following command:"
    echo ""
    echo "  $UPGRADE_CMD"
    echo ""
    exit 1
fi