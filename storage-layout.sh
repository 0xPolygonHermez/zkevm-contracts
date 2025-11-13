#!/bin/bash

# Optional: clean build output
# forge clean
# forge build

outfile="docs/storage_layout.txt"
rm -f "$outfile"

echo "📦 Dumping storage layouts for all contracts..."

for solfile in $(find contracts -type f -name "*.sol"); do
    contract=$(basename "$solfile" .sol)
    echo "🔹 $contract"
    forge inspect "$contract" storage >> "$outfile"
    echo "\n" >> "$outfile"
done
