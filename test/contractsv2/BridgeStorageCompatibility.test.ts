import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { artifacts } from 'hardhat';
import { assertCompatibleStorage } from '../../tools/bridgeCompatibility/storageLayout';
import { getPreviousBridgeBuild } from '../../tools/bridgeCompatibility/previousVersions';
import l1Baseline from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridge.v1.1.0.json';
import l2Baseline from '../../upgrade/previousVersions/bridge/snapshots/AgglayerBridgeL2.v1.2.0.json';

const incompatibleChanges: { name: string; mutate: (layout: any) => void }[] = [
    {
        name: 'moving an existing field to a different slot',
        mutate: (layout) => {
            const field = layout.storage.find((entry: any) => entry.label === 'networkID');
            field.slot = (BigInt(field.slot) + 1n).toString();
        },
    },
    {
        name: 'changing a packed address offset',
        mutate: (layout) => {
            const field = layout.storage.find((entry: any) => entry.label === 'globalExitRootManager');
            field.offset += 1;
        },
    },
    {
        name: 'changing the nullifier mapping value type',
        mutate: (layout) => {
            const field = layout.storage.find((entry: any) => entry.label === 'claimedBitMap');
            field.type = 't_mapping(t_uint256,t_address)';
            layout.types[field.type] = {
                encoding: 'mapping',
                key: 't_uint256',
                value: 't_address',
                label: 'mapping(uint256 => address)',
                numberOfBytes: '32',
            };
        },
    },
    {
        name: 'changing a wrapped-token struct member offset',
        mutate: (layout) => {
            const field = layout.storage.find((entry: any) => entry.label === 'wrappedTokenToTokenInfo');
            const mapping = layout.types[field.type];
            const member = layout.types[mapping.value].members.find(
                (entry: any) => entry.label === 'originTokenAddress',
            );
            member.offset += 1;
        },
    },
    {
        name: 'replacing dynamic metadata with an integer',
        mutate: (layout) => {
            layout.storage.find((entry: any) => entry.label === 'gasTokenMetadata').type = 't_uint256';
        },
    },
    {
        name: 'shrinking a reserved gap without consuming its slot',
        mutate: (layout) => {
            const gaps = layout.storage.filter((entry: any) => entry.label === '__gap');
            const gap = gaps[gaps.length - 1];
            gap.type = 't_array(t_uint256)47_storage';
            layout.types[gap.type] = {
                base: 't_uint256',
                encoding: 'inplace',
                label: 'uint256[47]',
                numberOfBytes: (47 * 32).toString(),
            };
        },
    },
];

describe('Bridge storage compatibility unit tests', () => {
    [l1Baseline, l2Baseline].forEach((baseline) => {
        describe(`${baseline.contractName} ${baseline.version}`, () => {
            it('keeps a readable original source identical to the frozen compiler input', () => {
                const archivedSource = path.resolve(
                    __dirname,
                    '../../upgrade/previousVersions/bridge',
                    baseline.sourceName,
                );
                const sources = baseline.input.sources as Record<string, { content: string }>;
                const l1Sources = l1Baseline.input.sources as Record<string, { content: string }>;
                expect(fs.readFileSync(archivedSource, 'utf8')).to.equal(sources[baseline.sourceName].content);
                expect(sources[l1Baseline.sourceName].content).to.equal(l1Sources[l1Baseline.sourceName].content);
            });

            it('compiles the preserved Solidity into the exact original deployment and runtime bytecode', async () => {
                const previous = await getPreviousBridgeBuild(baseline.contractName);
                expect(previous.bytecode).to.equal(baseline.bytecode);
                expect(previous.deployedBytecode).to.equal(baseline.deployedBytecode);
                assertCompatibleStorage(baseline.storageLayout, previous.storageLayout);
            });

            it('preserves the full ABI and each original slot, offset, and field type', async () => {
                const previous = await getPreviousBridgeBuild(baseline.contractName);
                const artifact = await artifacts.readArtifact(baseline.contractName);
                expect(artifact.abi).to.deep.equal(previous.abi);
                const build = await artifacts.getBuildInfo(`${baseline.sourceName}:${baseline.contractName}`);
                const layout = (build!.output.contracts[baseline.sourceName][baseline.contractName] as any)
                    .storageLayout;
                assertCompatibleStorage(previous.storageLayout, layout);
                const fields = (value: any) =>
                    value.storage.map(({ label, slot, offset }: any) => ({ label, slot, offset }));
                expect(fields(layout)).to.deep.equal(fields(baseline.storageLayout));
            });

            incompatibleChanges.forEach(({ name, mutate }) => {
                it(`rejects ${name}`, async () => {
                    const previous = await getPreviousBridgeBuild(baseline.contractName);
                    const layout = JSON.parse(JSON.stringify(previous.storageLayout));
                    mutate(layout);
                    expect(() => assertCompatibleStorage(previous.storageLayout, layout)).to.throw();
                });
            });
        });
    });

    it('preserves the full L1 storage prefix in both L2 implementations', async () => {
        assertCompatibleStorage(l1Baseline.storageLayout, l2Baseline.storageLayout);
        const build = await artifacts.getBuildInfo(`${l2Baseline.sourceName}:${l2Baseline.contractName}`);
        const contracts = build!.output.contracts as Record<string, Record<string, any>>;
        const l1 = contracts[l1Baseline.sourceName][l1Baseline.contractName].storageLayout;
        const l2 = contracts[l2Baseline.sourceName][l2Baseline.contractName].storageLayout;
        const module =
            contracts['contracts/sovereignChains/AgglayerBridgeL2Module.sol'].AgglayerBridgeL2Module.storageLayout;
        assertCompatibleStorage(l1Baseline.storageLayout, l1);
        assertCompatibleStorage(l1, l2);
        assertCompatibleStorage(l1, module);
        const prefix = (layout: any) =>
            layout.storage.slice(0, l1.storage.length).map(({ label, slot, offset }: any) => ({ label, slot, offset }));
        expect(prefix(l2)).to.deep.equal(prefix(l1));
        expect(prefix(module)).to.deep.equal(prefix(l1));
    });
});
