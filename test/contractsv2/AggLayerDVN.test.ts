import { expect } from 'chai';
import { ethers } from 'hardhat';
import { AggLayerDVN } from '../../typechain-types';

describe('AggLayerDVN', () => {
    let dvn: AggLayerDVN;
    let owner: any;
    let other: any;
    let allowedSender: any;

    const flatFeeWei = ethers.parseEther('0.01');

    // Minimal valid AssignJobParam values
    const dstEid = 30101; // e.g. Ethereum mainnet EID in LayerZero v2
    const packetHeader = ethers.randomBytes(80);
    const payloadHash = ethers.randomBytes(32) as unknown as string;
    const confirmations = 15n;

    beforeEach('Deploy AggLayerDVN', async () => {
        [owner, other, allowedSender] = await ethers.getSigners();

        const Factory = await ethers.getContractFactory('AggLayerDVN');
        dvn = (await Factory.deploy(owner.address)) as AggLayerDVN;
    });

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------
    describe('Happy path', () => {
        it('should emit JobAssigned and return flatFee when called correctly', async () => {
            // 1. Owner sets the flat fee
            await dvn.connect(owner).setFlatFee(flatFeeWei);
            expect(await dvn.flatFee()).to.equal(flatFeeWei);

            // 2. Owner adds the sender to the allowlist
            await dvn.connect(owner).addSender(allowedSender.address);
            expect(await dvn.allowedSenders(allowedSender.address)).to.equal(true);

            // 3. Build the AssignJobParam with the allowlisted sender
            const param = {
                dstEid,
                packetHeader,
                payloadHash: ethers.hexlify(payloadHash),
                confirmations,
                sender: allowedSender.address,
            };

            // 4. Call assignJob with msg.value == flatFee and verify event
            const tx = await dvn.connect(other).assignJob(param, '0x', { value: flatFeeWei });

            await expect(tx)
                .to.emit(dvn, 'JobAssigned')
                .withArgs(
                    ethers.hexlify(packetHeader),
                    ethers.hexlify(payloadHash),
                    dstEid,
                    allowedSender.address,
                    flatFeeWei,
                );

            // 5. Verify the return value (staticCall)
            const returned = await dvn
                .connect(other)
                .assignJob.staticCall(param, '0x', { value: flatFeeWei });
            expect(returned).to.equal(flatFeeWei);
        });
    });

    // -------------------------------------------------------------------------
    // Unauthorized sender
    // -------------------------------------------------------------------------
    describe('Unauthorized sender', () => {
        it('should revert with UnauthorizedSender when sender is not allowlisted', async () => {
            // Set fee so we don't hit FlatFeeNotSet first
            await dvn.connect(owner).setFlatFee(flatFeeWei);

            const param = {
                dstEid,
                packetHeader,
                payloadHash: ethers.hexlify(payloadHash),
                confirmations,
                sender: other.address, // not in allowlist
            };

            await expect(
                dvn.connect(other).assignJob(param, '0x', { value: flatFeeWei }),
            ).to.be.revertedWithCustomError(dvn, 'UnauthorizedSender').withArgs(other.address);
        });
    });

    // -------------------------------------------------------------------------
    // Fee not set
    // -------------------------------------------------------------------------
    describe('Fee not set', () => {
        it('should revert with FlatFeeNotSet when flatFee is still zero', async () => {
            // flatFee is 0 by default — do NOT call setFlatFee
            const param = {
                dstEid,
                packetHeader,
                payloadHash: ethers.hexlify(payloadHash),
                confirmations,
                sender: allowedSender.address,
            };

            await expect(
                dvn.connect(other).assignJob(param, '0x', { value: 0n }),
            ).to.be.revertedWithCustomError(dvn, 'FlatFeeNotSet');
        });
    });
});
