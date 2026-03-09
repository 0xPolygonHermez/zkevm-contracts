/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { AggOracleCommittee, AgglayerGERL2 } from '../../typechain-types';

describe('AggOracleCommittee tests', () => {
    upgrades.silenceWarnings();

    let aggOracleCommitteeContract: AggOracleCommittee;
    let globalExitRootManagerContract: AgglayerGERL2;

    let deployer: any;
    let owner: any;
    let oracle1: any;
    let oracle2: any;
    let oracle3: any;
    let oracle4: any;
    let notOracle: any;
    let bridge: any;
    let newGlobalExitRootUpdater: any;

    const INITIAL_PROPOSED_GER = ethers.solidityPacked(['uint256'], [1]);

    beforeEach('Deploy contracts', async () => {
        // load signers
        [deployer, owner, oracle1, oracle2, oracle3, oracle4, notOracle, bridge, newGlobalExitRootUpdater] =
            await ethers.getSigners();

        // deploy global exit root manager
        const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory('AgglayerGERL2');
        globalExitRootManagerContract = (await upgrades.deployProxy(
            GlobalExitRootManagerL2SovereignChainFactory,
            [deployer.address, deployer.address], // Initializer params
            {
                initializer: 'initialize', // initializer function name
                constructorArgs: [bridge.address], // Constructor arguments
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            },
        )) as unknown as AgglayerGERL2;

        // deploy AggOracleCommittee
        const AggOracleCommitteeFactory = await ethers.getContractFactory('AggOracleCommittee');
        aggOracleCommitteeContract = (await upgrades.deployProxy(AggOracleCommitteeFactory, [], {
            initializer: false,
            constructorArgs: [globalExitRootManagerContract.target],
            unsafeAllow: ['constructor'],
        })) as unknown as AggOracleCommittee;
    });

    describe('Deployment and Initialization', () => {
        it('Should initialize with correct parameters', async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address];

            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);

            expect(await aggOracleCommitteeContract.owner()).to.equal(owner.address);
            expect(await aggOracleCommitteeContract.quorum()).to.equal(quorum);
            expect(await aggOracleCommitteeContract.getAggOracleMembersCount()).to.equal(2);
            expect(await aggOracleCommitteeContract.addressToLastProposedGER(oracle1.address)).to.equal(
                INITIAL_PROPOSED_GER,
            );
            expect(await aggOracleCommitteeContract.addressToLastProposedGER(oracle2.address)).to.equal(
                INITIAL_PROPOSED_GER,
            );
        });

        it('Should fail to initialize with zero quorum', async () => {
            const quorum = 0;
            const oracleMembers = [oracle1.address];

            await expect(aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum)).to.be.reverted;
        });

        it('Should fail to reinitialize', async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address];

            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);

            await expect(
                aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'InvalidInitialization');
        });

        it('Should properly set globalExitRootManagerL2Sovereign', async () => {
            expect(await aggOracleCommitteeContract.globalExitRootManagerL2Sovereign()).to.equal(
                globalExitRootManagerContract.target,
            );
        });
    });

    describe('Oracle Member Management', () => {
        beforeEach(async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address];
            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);
        });

        it('Should add a new oracle member', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).addOracleMember(oracle3.address))
                .to.emit(aggOracleCommitteeContract, 'AddAggOracleMember')
                .withArgs(oracle3.address);

            expect(await aggOracleCommitteeContract.getAggOracleMembersCount()).to.equal(3);
            expect(await aggOracleCommitteeContract.addressToLastProposedGER(oracle3.address)).to.equal(
                INITIAL_PROPOSED_GER,
            );
        });

        it('Should fail to add zero address as oracle member', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).addOracleMember(ethers.ZeroAddress)).to.be.reverted;
        });

        it('Should fail to add existing oracle member', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).addOracleMember(oracle1.address)).to.be.reverted;
        });

        it('Should fail to add oracle member if not owner', async () => {
            await expect(
                aggOracleCommitteeContract.connect(oracle1).addOracleMember(oracle3.address),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });

        it('Should remove an oracle member', async () => {
            const oracleIndex = await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle1.address);

            await expect(aggOracleCommitteeContract.connect(owner).removeOracleMember(oracle1.address, oracleIndex))
                .to.emit(aggOracleCommitteeContract, 'RemoveAggOracleMember')
                .withArgs(oracle1.address);

            expect(await aggOracleCommitteeContract.getAggOracleMembersCount()).to.equal(1);
            expect(await aggOracleCommitteeContract.addressToLastProposedGER(oracle1.address)).to.equal(
                ethers.ZeroHash,
            );
        });

        it('Should fail to remove non-existent oracle member', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).removeOracleMember(notOracle.address, 0)).to.be
                .reverted;
        });

        it('Should fail to remove oracle member with wrong index', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).removeOracleMember(oracle1.address, 1)).to.be
                .reverted;
        });

        it('Should fail to remove oracle member if not owner', async () => {
            await expect(
                aggOracleCommitteeContract.connect(oracle1).removeOracleMember(oracle2.address, 1),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });

        it('Should remove oracle member and subtract their vote', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

            const reportBefore = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            expect(reportBefore.votes).to.equal(1);

            const oracleIndex = await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle1.address);
            await aggOracleCommitteeContract.connect(owner).removeOracleMember(oracle1.address, oracleIndex);

            const reportAfter = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            expect(reportAfter.votes).to.equal(0);
        });

        it('Should handle array reordering when removing oracle member', async () => {
            // Add a third oracle
            await aggOracleCommitteeContract.connect(owner).addOracleMember(oracle3.address);

            // Remove the middle oracle (oracle2)
            const oracle2Index = await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle2.address);
            await aggOracleCommitteeContract.connect(owner).removeOracleMember(oracle2.address, oracle2Index);

            // Check that oracle3 took oracle2's place
            const allMembers = await aggOracleCommitteeContract.getAllAggOracleMembers();
            expect(allMembers.length).to.equal(2);
            expect(allMembers[oracle2Index]).to.equal(oracle3.address);
        });
    });

    describe('Quorum Management', () => {
        beforeEach(async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address];
            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);
        });

        it('Should update quorum', async () => {
            const newQuorum = 3;
            await expect(aggOracleCommitteeContract.connect(owner).updateQuorum(newQuorum))
                .to.emit(aggOracleCommitteeContract, 'UpdateQuorum')
                .withArgs(newQuorum);

            expect(await aggOracleCommitteeContract.quorum()).to.equal(newQuorum);
        });

        it('Should fail to update quorum to zero', async () => {
            await expect(aggOracleCommitteeContract.connect(owner).updateQuorum(0)).to.be.reverted;
        });

        it('Should fail to update quorum if not owner', async () => {
            await expect(aggOracleCommitteeContract.connect(oracle1).updateQuorum(3)).to.be.revertedWithCustomError(
                aggOracleCommitteeContract,
                'OwnableUnauthorizedAccount',
            );
        });
    });

    describe('Global Exit Root Proposals', () => {
        beforeEach(async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address, oracle3.address];
            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);

            // Transfer globalExitRootUpdater role to aggOracleCommittee
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);
            await aggOracleCommitteeContract.connect(owner).acceptGlobalExitRootUpdater();
        });

        it('Should propose a global exit root', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            await expect(aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER))
                .to.emit(aggOracleCommitteeContract, 'ProposedGlobalExitRoot')
                .withArgs(proposedGER, oracle1.address);

            const report = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            expect(report.votes).to.equal(1);
            expect(report.timestamp).to.be.gt(0);

            expect(await aggOracleCommitteeContract.addressToLastProposedGER(oracle1.address)).to.equal(proposedGER);
        });

        it('Should fail to propose if not oracle member', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);
            await expect(aggOracleCommitteeContract.connect(notOracle).proposeGlobalExitRoot(proposedGER)).to.be
                .reverted;
        });

        it('Should fail to propose INITIAL_PROPOSED_GER', async () => {
            await expect(aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(INITIAL_PROPOSED_GER)).to.be
                .reverted;
        });

        it('Should fail to propose zero hash', async () => {
            await expect(aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(ethers.ZeroHash)).to.be
                .reverted;
        });

        it('Should consolidate when quorum is reached', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // First vote
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

            // Second vote reaches quorum
            await expect(aggOracleCommitteeContract.connect(oracle2).proposeGlobalExitRoot(proposedGER))
                .to.emit(aggOracleCommitteeContract, 'ConsolidatedGlobalExitRoot')
                .withArgs(proposedGER)
                .to.emit(globalExitRootManagerContract, 'UpdateHashChainValue');
            // Note: We don't check the second parameter (insertedGERHashChain) as it depends on the previous state

            // Check that the report was deleted after consolidation
            const report = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            expect(report.votes).to.equal(0);
            expect(report.timestamp).to.equal(0);
        });

        it('Should handle multiple proposals without reaching quorum', async () => {
            const proposedGER1 = ethers.solidityPacked(['uint256'], [42]);
            const proposedGER2 = ethers.solidityPacked(['uint256'], [43]);

            // Oracle1 proposes GER1
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);

            // Oracle3 proposes GER2
            await aggOracleCommitteeContract.connect(oracle3).proposeGlobalExitRoot(proposedGER2);

            const report1 = await aggOracleCommitteeContract.proposedGERToReport(proposedGER1);
            const report2 = await aggOracleCommitteeContract.proposedGERToReport(proposedGER2);

            expect(report1.votes).to.equal(1);
            expect(report2.votes).to.equal(1);
        });

        it('Should handle vote switching', async () => {
            const proposedGER1 = ethers.solidityPacked(['uint256'], [42]);
            const proposedGER2 = ethers.solidityPacked(['uint256'], [43]);

            // Oracle1 proposes GER1
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);

            // Oracle1 switches to GER2
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER2);

            const report1 = await aggOracleCommitteeContract.proposedGERToReport(proposedGER1);
            const report2 = await aggOracleCommitteeContract.proposedGERToReport(proposedGER2);

            expect(report1.votes).to.equal(0); // Vote was subtracted
            expect(report2.votes).to.equal(1); // New vote was added
        });

        it('Should not subtract vote from already consolidated report', async () => {
            const proposedGER1 = ethers.solidityPacked(['uint256'], [42]);
            const proposedGER2 = ethers.solidityPacked(['uint256'], [43]);

            // Two oracles vote for GER1, reaching quorum and consolidating
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);
            await aggOracleCommitteeContract.connect(oracle2).proposeGlobalExitRoot(proposedGER1);

            // Oracle1 switches to GER2 (should not affect the already consolidated GER1)
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER2);

            const report1 = await aggOracleCommitteeContract.proposedGERToReport(proposedGER1);
            expect(report1.votes).to.equal(0); // Still 0 after consolidation
        });

        it('Should add vote to existing report', async () => {
            // Set quorum to 3 so it's not reached with just 2 votes
            await aggOracleCommitteeContract.connect(owner).updateQuorum(3);

            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // First vote
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

            const reportBefore = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            const { timestamp } = reportBefore;

            // Add time delay
            await ethers.provider.send('evm_increaseTime', [100]);
            await ethers.provider.send('evm_mine', []);

            // Second vote to existing report
            await aggOracleCommitteeContract.connect(oracle2).proposeGlobalExitRoot(proposedGER);

            const reportAfter = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            expect(reportAfter.timestamp).to.equal(timestamp); // Timestamp should not change
            expect(reportAfter.votes).to.equal(2); // Votes should increase
        });

        it('Should fail when oracle tries to vote for the same GER twice', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // Oracle1 proposes GER
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

            // Oracle1 tries to vote for the same GER again
            await expect(
                aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'AlreadyVotedForThisGER');
        });

        it('Should allow consolidateGlobalExitRoot when quorum is reached', async () => {
            // Set quorum to 3
            await aggOracleCommitteeContract.connect(owner).updateQuorum(3);

            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // First two votes
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);
            await aggOracleCommitteeContract.connect(oracle2).proposeGlobalExitRoot(proposedGER);

            // Lower quorum to 2
            await aggOracleCommitteeContract.connect(owner).updateQuorum(2);

            // Now consolidate should work
            await expect(aggOracleCommitteeContract.consolidateGlobalExitRoot(proposedGER))
                .to.emit(aggOracleCommitteeContract, 'ConsolidatedGlobalExitRoot')
                .withArgs(proposedGER)
                .to.emit(globalExitRootManagerContract, 'UpdateHashChainValue');

            // Check that the report was deleted after consolidation
            const report = await aggOracleCommitteeContract.proposedGERToReport(proposedGER);
            expect(report.votes).to.equal(0);
            expect(report.timestamp).to.equal(0);
        });

        it('Should fail consolidateGlobalExitRoot when quorum is not reached', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // Only one vote when quorum is 2
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);

            // Try to consolidate - should fail
            await expect(
                aggOracleCommitteeContract.consolidateGlobalExitRoot(proposedGER),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'QuorumNotReached');
        });

        it('Should fail consolidateGlobalExitRoot for non-existent GER', async () => {
            const nonExistentGER = ethers.solidityPacked(['uint256'], [999]);

            // Try to consolidate a GER that was never proposed
            await expect(
                aggOracleCommitteeContract.consolidateGlobalExitRoot(nonExistentGER),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'QuorumNotReached');
        });
    });

    describe('Global Exit Root Updater Role Transfer', () => {
        beforeEach(async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address];
            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);
        });

        it('Should transfer globalExitRootUpdater role', async () => {
            // First transfer to aggOracleCommittee
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);
            await aggOracleCommitteeContract.connect(owner).acceptGlobalExitRootUpdater();

            expect(await globalExitRootManagerContract.globalExitRootUpdater()).to.equal(
                aggOracleCommitteeContract.target,
            );

            // Now transfer from aggOracleCommittee to another address
            await expect(
                aggOracleCommitteeContract
                    .connect(owner)
                    .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address),
            )
                .to.emit(globalExitRootManagerContract, 'TransferGlobalExitRootUpdater')
                .withArgs(aggOracleCommitteeContract.target, newGlobalExitRootUpdater.address);

            expect(await globalExitRootManagerContract.pendingGlobalExitRootUpdater()).to.equal(
                newGlobalExitRootUpdater.address,
            );
        });

        it('Should fail to transfer if not owner', async () => {
            await expect(
                aggOracleCommitteeContract
                    .connect(oracle1)
                    .transferGlobalExitRootUpdater(newGlobalExitRootUpdater.address),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });

        it('Should accept globalExitRootUpdater role', async () => {
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);

            await expect(aggOracleCommitteeContract.connect(owner).acceptGlobalExitRootUpdater())
                .to.emit(globalExitRootManagerContract, 'AcceptGlobalExitRootUpdater')
                .withArgs(deployer.address, aggOracleCommitteeContract.target);

            expect(await globalExitRootManagerContract.globalExitRootUpdater()).to.equal(
                aggOracleCommitteeContract.target,
            );
        });

        it('Should fail to accept if not owner', async () => {
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);

            await expect(
                aggOracleCommitteeContract.connect(oracle1).acceptGlobalExitRootUpdater(),
            ).to.be.revertedWithCustomError(aggOracleCommitteeContract, 'OwnableUnauthorizedAccount');
        });
    });

    describe('View Functions', () => {
        beforeEach(async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address, oracle3.address];
            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);
        });

        it('Should get oracle member index', async () => {
            expect(await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle1.address)).to.equal(0);
            expect(await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle2.address)).to.equal(1);
            expect(await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle3.address)).to.equal(2);
        });

        it('Should revert when getting index of non-member', async () => {
            await expect(aggOracleCommitteeContract.getAggOracleMemberIndex(notOracle.address)).to.be.reverted;
        });

        it('Should get all oracle members', async () => {
            const members = await aggOracleCommitteeContract.getAllAggOracleMembers();
            expect(members.length).to.equal(3);
            expect(members[0]).to.equal(oracle1.address);
            expect(members[1]).to.equal(oracle2.address);
            expect(members[2]).to.equal(oracle3.address);
        });

        it('Should get oracle members count', async () => {
            expect(await aggOracleCommitteeContract.getAggOracleMembersCount()).to.equal(3);
        });

        it('Should get oracle member by index', async () => {
            expect(await aggOracleCommitteeContract.aggOracleMembers(0)).to.equal(oracle1.address);
            expect(await aggOracleCommitteeContract.aggOracleMembers(1)).to.equal(oracle2.address);
            expect(await aggOracleCommitteeContract.aggOracleMembers(2)).to.equal(oracle3.address);
        });

        it('Should get constant INITIAL_PROPOSED_GER', async () => {
            expect(await aggOracleCommitteeContract.INITIAL_PROPOSED_GER()).to.equal(INITIAL_PROPOSED_GER);
        });
    });

    describe('Edge Cases and Complex Scenarios', () => {
        beforeEach(async () => {
            const quorum = 2;
            const oracleMembers = [oracle1.address, oracle2.address, oracle3.address];
            await aggOracleCommitteeContract.initialize(owner.address, oracleMembers, quorum);

            // Transfer globalExitRootUpdater role to aggOracleCommittee
            await globalExitRootManagerContract.transferGlobalExitRootUpdater(aggOracleCommitteeContract.target);
            await aggOracleCommitteeContract.connect(owner).acceptGlobalExitRootUpdater();
        });

        it('Should handle multiple vote switches correctly', async () => {
            const proposedGER1 = ethers.solidityPacked(['uint256'], [42]);
            const proposedGER2 = ethers.solidityPacked(['uint256'], [43]);
            const proposedGER3 = ethers.solidityPacked(['uint256'], [44]);

            // Oracle1 votes for GER1
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER1);
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER1)).votes).to.equal(1);

            // Oracle1 switches to GER2
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER2);
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER1)).votes).to.equal(0);
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER2)).votes).to.equal(1);

            // Oracle1 switches to GER3
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER3);
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER1)).votes).to.equal(0);
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER2)).votes).to.equal(0);
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER3)).votes).to.equal(1);
        });

        it('Should handle quorum exactly equal to oracle count', async () => {
            // Update quorum to 3 (equal to number of oracles)
            await aggOracleCommitteeContract.connect(owner).updateQuorum(3);

            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // First two votes
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);
            await aggOracleCommitteeContract.connect(oracle2).proposeGlobalExitRoot(proposedGER);

            // Still not consolidated
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER)).votes).to.equal(2);

            // Third vote reaches quorum
            await expect(aggOracleCommitteeContract.connect(oracle3).proposeGlobalExitRoot(proposedGER))
                .to.emit(aggOracleCommitteeContract, 'ConsolidatedGlobalExitRoot')
                .withArgs(proposedGER);
        });

        it('Should handle removing oracle after voting', async () => {
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);

            // Oracle1 and Oracle2 vote
            await aggOracleCommitteeContract.connect(oracle1).proposeGlobalExitRoot(proposedGER);
            await aggOracleCommitteeContract.connect(oracle2).proposeGlobalExitRoot(proposedGER);

            // Consolidation happens
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER)).votes).to.equal(0);

            // Remove oracle1 after consolidation
            const oracleIndex = await aggOracleCommitteeContract.getAggOracleMemberIndex(oracle1.address);
            await aggOracleCommitteeContract.connect(owner).removeOracleMember(oracle1.address, oracleIndex);

            // Should not affect the already consolidated report
            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER)).votes).to.equal(0);
        });

        it('Should fail to initialize with quorum greater than oracle members', async () => {
            const quorum = 1;
            const oracleMembers: string[] = [];

            // Deploy new instance
            const AggOracleCommitteeFactory = await ethers.getContractFactory('AggOracleCommittee');
            const newAggOracleCommittee = (await upgrades.deployProxy(AggOracleCommitteeFactory, [], {
                initializer: false,
                constructorArgs: [globalExitRootManagerContract.target],
                unsafeAllow: ['constructor'],
            })) as unknown as AggOracleCommittee;

            // Should fail because quorum (1) > oracle members (0)
            await expect(
                newAggOracleCommittee.initialize(owner.address, oracleMembers, quorum),
            ).to.be.revertedWithCustomError(newAggOracleCommittee, 'QuorumCannotBeGreaterThanAggOracleMembers');
        });

        it('Should handle vote on first proposal after being added as oracle', async () => {
            // Add new oracle
            await aggOracleCommitteeContract.connect(owner).addOracleMember(oracle4.address);

            // New oracle should be able to vote immediately
            const proposedGER = ethers.solidityPacked(['uint256'], [42]);
            await expect(aggOracleCommitteeContract.connect(oracle4).proposeGlobalExitRoot(proposedGER))
                .to.emit(aggOracleCommitteeContract, 'ProposedGlobalExitRoot')
                .withArgs(proposedGER, oracle4.address);

            expect((await aggOracleCommitteeContract.proposedGERToReport(proposedGER)).votes).to.equal(1);
        });
    });
});
