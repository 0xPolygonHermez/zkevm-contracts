import fs from 'fs';
import path from 'path';

const bridgeAddressImpl = '0x1F4479ccb333FCBa58e68f04e38F3AB070983b31';
const previousTag = 'v4.0.0-fork.7';

async function main() {
    const code = await ethers.provider.getCode(bridgeAddressImpl);
    const api = `https://api.github.com/repos/agglayer/agglayer-contracts/contents/compiled-contracts/PolygonZkEVMBridgeV2.json?ref=${previousTag}`;
    // eslint-disable-next-line import/no-dynamic-require, global-require, @typescript-eslint/no-var-requires
    const previousVersion = require(
        path.join(
            __dirname,
            '../../../artifacts/contracts/previousVersions/pessimistic/PolygonZkEVMBridgeV2Pessimistic.sol/PolygonZkEVMBridgeV2Pessimistic.json',
        ),
    );
    const codeRepository = previousVersion.deployedBytecode;
    const res = await fetch(api, { headers: { Accept: 'application/vnd.github.raw' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()).deployedBytecode;
    await fs.writeFileSync(path.join(__dirname, './code.json'), JSON.stringify(code, null, 2));
    await fs.writeFileSync(path.join(__dirname, './data.json'), JSON.stringify(data, null, 2));
    await fs.writeFileSync(path.join(__dirname, './codeRepository.json'), JSON.stringify(codeRepository, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
