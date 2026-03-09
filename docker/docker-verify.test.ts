import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { AgglayerManager, AgglayerGER, AggchainFEP } from '../typechain-types';

import { TRUSTED_AGGREGATOR_ROLE } from '../src/constants';
import { computeRandomBytes } from '../src/pessimistic-utils';
import { encodeAggchainDataFEP } from '../src/utils-aggchain-FEP';

describe('Docker verifyProof test', () => {
    // Read docker deployment output
    const dockerCreateRollupOutput = JSON.parse(
        fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
    );
    const dockerDeploymentOutput = JSON.parse(
        fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'),
    );
    const dockerCreateRollup = JSON.parse(
        fs.readFileSync(path.join(__dirname, './scripts/v2/create_rollup_parameters_docker.json'), 'utf8'),
    );

    it('should check AggchainFEP', async () => {
        // Load deployer & trustedAggregator
        const [, trustedAggregator] = await ethers.getSigners();

        // Check trustedAggregator
        const trustedAggregatorDeploy = dockerDeploymentOutput.trustedAggregator;
        expect(trustedAggregator.address).to.equal(trustedAggregatorDeploy);

        const { rollupID } = dockerCreateRollupOutput;

        // Load contracts
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            dockerDeploymentOutput.polygonRollupManagerAddress,
        ) as AgglayerManager;
        await rollupManagerContract.connect(trustedAggregator);

        expect(rollupManagerContract.target).to.equal(dockerDeploymentOutput.polygonRollupManagerAddress);

        const PolygonZkEVMGlobalExitRootV2Factory = await ethers.getContractFactory('AgglayerGER');
        const polygonZkEVMGlobalExitRoot = PolygonZkEVMGlobalExitRootV2Factory.attach(
            dockerDeploymentOutput.polygonZkEVMGlobalExitRootAddress,
        ) as AgglayerGER;

        expect(polygonZkEVMGlobalExitRoot.target).to.equal(dockerDeploymentOutput.polygonZkEVMGlobalExitRootAddress);

        const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
        const aggchainFEP = AggchainFEPFactory.attach(dockerCreateRollupOutput.rollupAddress) as AggchainFEP;

        expect(aggchainFEP.target).to.equal(dockerCreateRollupOutput.rollupAddress);

        // get last L1InfoTreeLeafCount
        const lastL1InfoTreeLeafCount = await polygonZkEVMGlobalExitRoot.depositCount();

        // Verify pessimist proof with the new FEP rollup
        const newl2BlockNumber = 105;
        const newStateRoot = ethers.id('newStateRoot');
        const randomNewLocalExitRoot = computeRandomBytes(32);
        const randomNewPessimisticRoot = computeRandomBytes(32);
        const randomProof = computeRandomBytes(128);
        // append first 4 bytes to the proof to select the pessimistic vkey
        const proofWithSelector = `${dockerDeploymentOutput.pessimisticVKeyRouteALGateway.pessimisticVKeySelector}${randomProof.slice(2)}`;

        const CUSTOM_DATA_FEP = encodeAggchainDataFEP(
            dockerCreateRollup.aggchainParams.initAggchainVKeySelector,
            newStateRoot,
            newl2BlockNumber,
        );

        // check Role
        expect(await rollupManagerContract.hasRole(TRUSTED_AGGREGATOR_ROLE, trustedAggregator.address)).to.be.equal(
            true,
        );

        // verify pessimistic proof
        const onVerifyPessimisticTx = await rollupManagerContract
            .connect(trustedAggregator)
            .verifyPessimisticTrustedAggregator(
                rollupID,
                lastL1InfoTreeLeafCount,
                randomNewLocalExitRoot,
                randomNewPessimisticRoot,
                proofWithSelector,
                CUSTOM_DATA_FEP,
            );
        await onVerifyPessimisticTx.wait();

        // get timestamp
        const lastBlock = await ethers.provider.getBlock('latest');
        const blockDataTimestamp = lastBlock?.timestamp;

        // check events
        await expect(onVerifyPessimisticTx)
            .to.emit(rollupManagerContract, 'VerifyBatchesTrustedAggregator')
            .withArgs(rollupID, 0, ethers.ZeroHash, randomNewLocalExitRoot, trustedAggregator)
            .to.emit(aggchainFEP, 'OutputProposed')
            .withArgs(newStateRoot, 1, newl2BlockNumber, blockDataTimestamp);

        // eslint-disable-next-line no-console
        console.log('Transaction verifyPessimisticTrustedAggregator completed');
    });
});
