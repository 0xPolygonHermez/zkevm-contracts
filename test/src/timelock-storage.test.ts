import { expect } from 'chai';
import { ethers } from 'hardhat';
import lodash from 'lodash';

import { initializeTimelockStorage } from '../../src/genesis/genesis-helpers';
import { getTraceStorageWrites } from '../../src/utils';

describe('Timelock storage util', () => {
    it('Verify genesis util: initializeTimelockStorage', async () => {
        const minDelay = 3600;
        const timelockAdminAddress = '0x1234567890123456789012345678901234567890';

        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const timelockContract = await timelockContractFactory.deploy(
            minDelay,
            [timelockAdminAddress],
            [timelockAdminAddress],
            timelockAdminAddress,
            ethers.ZeroAddress,
        );
        const tx = await timelockContract.deploymentTransaction();

        // Get utils storage and compare with the one computed
        const computedTimelockStorage = await getTraceStorageWrites(tx.hash, timelockContract.target);
        const utilsTimelockStorage = initializeTimelockStorage(minDelay, timelockAdminAddress, timelockContract.target);
        expect(lodash.isEqual(computedTimelockStorage, utilsTimelockStorage)).to.be.equal(true);
    });
});
