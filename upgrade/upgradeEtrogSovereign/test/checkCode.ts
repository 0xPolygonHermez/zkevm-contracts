import fs from 'fs';
import path from 'path';

const bridgeAddressImpl = '0x1F4479ccb333FCBa58e68f04e38F3AB070983b31';
const previousTag = 'v4.0.0-fork.7';

async function main() {
    const code = await ethers.provider.getCode(bridgeAddressImpl);
    const api = `https://api.github.com/repos/agglayer/agglayer-contracts/contents/compiled-contracts/PolygonZkEVMBridgeV2.json?ref=${previousTag}`;
    const res = await fetch(api, { headers: { Accept: 'application/vnd.github.raw' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()).deployedBytecode;
    await fs.writeFileSync(path.join(__dirname, './code.json'), JSON.stringify(code, null, 2));
    await fs.writeFileSync(path.join(__dirname, './data.json'), JSON.stringify(data, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
