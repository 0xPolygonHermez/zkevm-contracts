import { expect } from 'chai';
import { ethers } from 'hardhat';

/**
 * Helper: build a valid 81-byte LayerZero packet header.
 *
 * Packet header layout (PacketV1Codec):
 *   [0:1]   version  (1 byte)
 *   [1:9]   nonce    (8 bytes, uint64 big-endian)
 *   [9:13]  srcEid   (4 bytes, uint32 big-endian)
 *   [13:45] sender   (32 bytes, bytes32)
 *   [45:49] dstEid   (4 bytes, uint32 big-endian)
 *   [49:81] receiver (32 bytes, bytes32)
 */
function buildPacketHeader(
    version: number,
    nonce: bigint,
    srcEid: number,
    sender: string, // bytes32 hex (66 chars)
    dstEid: number,
    receiver: string, // address (20 bytes, will be padded to 32)
): Uint8Array {
    const buf = new Uint8Array(81);
    // version [0:1]
    buf[0] = version & 0xff;
    // nonce [1:9] big-endian uint64
    const nonceBig = BigInt(nonce);
    for (let i = 0; i < 8; i++) {
        buf[8 - i] = Number((nonceBig >> BigInt(i * 8)) & 0xffn);
    }
    // srcEid [9:13] big-endian uint32
    buf[9] = (srcEid >>> 24) & 0xff;
    buf[10] = (srcEid >>> 16) & 0xff;
    buf[11] = (srcEid >>> 8) & 0xff;
    buf[12] = srcEid & 0xff;
    // sender [13:45] — 32 bytes, strip 0x prefix
    const senderBytes = ethers.getBytes(sender); // expects bytes32 hex
    buf.set(senderBytes.slice(0, 32), 13);
    // dstEid [45:49] big-endian uint32
    buf[45] = (dstEid >>> 24) & 0xff;
    buf[46] = (dstEid >>> 16) & 0xff;
    buf[47] = (dstEid >>> 8) & 0xff;
    buf[48] = dstEid & 0xff;
    // receiver [49:81] — address padded to 32 bytes (left zero-padded)
    const receiverBytes = ethers.getBytes(ethers.zeroPadValue(receiver, 32));
    buf.set(receiverBytes.slice(0, 32), 49);
    return buf;
}

describe('AggLayerDVNCoordinator', () => {
    let owner: any;
    let worker: any;
    let nonWorker: any;

    // Shared test parameters
    const srcEid = 30101; // Ethereum mainnet EID (LayerZero v2)
    const dstEid = 30110; // Optimism EID (LayerZero v2)
    const nonce = 1n;
    // sender as bytes32 (left-padded address for illustration)
    const senderAddress = '0x1111111111111111111111111111111111111111';
    const sender = ethers.zeroPadValue(senderAddress, 32);

    const guid = ethers.hexlify(ethers.randomBytes(32));
    const message = ethers.toUtf8Bytes('hello agglayer');
    const confirmations = 15n;

    // Helper: build a valid AggLayerClaim (values irrelevant for coordinator tests)
    function buildClaim() {
        return {
            smtProofLocalExitRoot: Array(32).fill(ethers.ZeroHash),
            smtProofRollupExitRoot: Array(32).fill(ethers.ZeroHash),
            globalIndex: 0n,
            mainnetExitRoot: ethers.ZeroHash,
            rollupExitRoot: ethers.ZeroHash,
            originNetwork: 0,
            originTokenAddress: ethers.ZeroAddress,
            destinationNetwork: 0,
            destinationAddress: ethers.ZeroAddress,
            amount: 0n,
            metadata: '0x',
        };
    }

    // -------------------------------------------------------------------------
    // Test 1 — Happy path
    // -------------------------------------------------------------------------
    describe('Happy path: claimAndReserve succeeds → verify called → event emitted', () => {
        it('should call claimAndReserve, verify, and emit ClaimedAndVerified', async () => {
            [owner, worker, nonWorker] = await ethers.getSigners();

            // Deploy mocks
            const HappyFactory = await ethers.getContractFactory('MockOFTReceiverHappy');
            const happyReceiver = await HappyFactory.deploy();

            const LibFactory = await ethers.getContractFactory('MockReceiveLib');
            const receiveLib = await LibFactory.deploy();

            // Deploy coordinator
            const CoordFactory = await ethers.getContractFactory('AggLayerDVNCoordinator');
            const coordinator = await CoordFactory.deploy(
                owner.address,
                await receiveLib.getAddress(),
                await happyReceiver.getAddress(),
            );

            // Allow the worker
            await coordinator.connect(owner).addWorker(worker.address);

            // Build packet header with coordinator as receiver
            const packetHeader = buildPacketHeader(
                1,
                nonce,
                srcEid,
                sender,
                dstEid,
                await coordinator.getAddress(),
            );

            // Compute payloadHash as keccak256(guid ++ message)
            const payloadHash = ethers.keccak256(
                ethers.concat([ethers.getBytes(guid), message]),
            );

            // Compute expected releaseKey
            const originTuple = {
                srcEid,
                sender: sender as `0x${string}`,
                nonce,
            };
            const releaseKey = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['uint32', 'bytes32', 'uint64', 'address', 'bytes32', 'bytes32'],
                    [
                        originTuple.srcEid,
                        originTuple.sender,
                        originTuple.nonce,
                        await coordinator.getAddress(),
                        guid,
                        payloadHash,
                    ],
                ),
            );

            const claim = buildClaim();

            const tx = await coordinator.connect(worker).claimAndVerify(
                originTuple,
                guid,
                message,
                claim,
                packetHeader,
                payloadHash,
                confirmations,
            );

            // ClaimedAndVerified event
            await expect(tx)
                .to.emit(coordinator, 'ClaimedAndVerified')
                .withArgs(releaseKey, guid, payloadHash);

            // claimAndReserve was called on the receiver
            expect(await happyReceiver.claimAndReserveCalled()).to.equal(true);
            expect(await happyReceiver.reserveAfterClaimCalled()).to.equal(false);

            // verify was called on the receive lib
            expect(await receiveLib.verifyCalled()).to.equal(true);
            expect(await receiveLib.lastPayloadHash()).to.equal(payloadHash);
        });
    });

    // -------------------------------------------------------------------------
    // Test 2 — Front-run path (AlreadyClaimed fallthrough)
    // -------------------------------------------------------------------------
    describe('Front-run path: claimAndReserve reverts with AlreadyClaimed() → reserveAfterClaim → verify', () => {
        it('should fall through to reserveAfterClaim and still emit ClaimedAndVerified', async () => {
            [owner, worker, nonWorker] = await ethers.getSigners();

            const AlreadyClaimedFactory = await ethers.getContractFactory('MockOFTReceiverAlreadyClaimed');
            const alreadyClaimedReceiver = await AlreadyClaimedFactory.deploy();

            const LibFactory = await ethers.getContractFactory('MockReceiveLib');
            const receiveLib = await LibFactory.deploy();

            const CoordFactory = await ethers.getContractFactory('AggLayerDVNCoordinator');
            const coordinator = await CoordFactory.deploy(
                owner.address,
                await receiveLib.getAddress(),
                await alreadyClaimedReceiver.getAddress(),
            );

            await coordinator.connect(owner).addWorker(worker.address);

            const packetHeader = buildPacketHeader(
                1,
                nonce,
                srcEid,
                sender,
                dstEid,
                await coordinator.getAddress(),
            );

            const payloadHash = ethers.keccak256(
                ethers.concat([ethers.getBytes(guid), message]),
            );

            const originTuple = { srcEid, sender: sender as `0x${string}`, nonce };
            const releaseKey = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ['uint32', 'bytes32', 'uint64', 'address', 'bytes32', 'bytes32'],
                    [
                        originTuple.srcEid,
                        originTuple.sender,
                        originTuple.nonce,
                        await coordinator.getAddress(),
                        guid,
                        payloadHash,
                    ],
                ),
            );

            const claim = buildClaim();

            const tx = await coordinator.connect(worker).claimAndVerify(
                originTuple,
                guid,
                message,
                claim,
                packetHeader,
                payloadHash,
                confirmations,
            );

            await expect(tx)
                .to.emit(coordinator, 'ClaimedAndVerified')
                .withArgs(releaseKey, guid, payloadHash);

            // reserveAfterClaim (not claimAndReserve) was the one that succeeded
            expect(await alreadyClaimedReceiver.reserveAfterClaimCalled()).to.equal(true);

            // verify still called
            expect(await receiveLib.verifyCalled()).to.equal(true);
        });
    });

    // -------------------------------------------------------------------------
    // Test 3 — Unauthorized worker
    // -------------------------------------------------------------------------
    describe('Unauthorized worker', () => {
        it('should revert with UnauthorizedWorker when caller is not in allowlist', async () => {
            [owner, worker, nonWorker] = await ethers.getSigners();

            const HappyFactory = await ethers.getContractFactory('MockOFTReceiverHappy');
            const happyReceiver = await HappyFactory.deploy();

            const LibFactory = await ethers.getContractFactory('MockReceiveLib');
            const receiveLib = await LibFactory.deploy();

            const CoordFactory = await ethers.getContractFactory('AggLayerDVNCoordinator');
            const coordinator = await CoordFactory.deploy(
                owner.address,
                await receiveLib.getAddress(),
                await happyReceiver.getAddress(),
            );

            // worker NOT added to allowlist

            const packetHeader = buildPacketHeader(
                1,
                nonce,
                srcEid,
                sender,
                dstEid,
                await coordinator.getAddress(),
            );

            const payloadHash = ethers.keccak256(
                ethers.concat([ethers.getBytes(guid), message]),
            );

            const originTuple = { srcEid, sender: sender as `0x${string}`, nonce };
            const claim = buildClaim();

            await expect(
                coordinator.connect(nonWorker).claimAndVerify(
                    originTuple,
                    guid,
                    message,
                    claim,
                    packetHeader,
                    payloadHash,
                    confirmations,
                ),
            )
                .to.be.revertedWithCustomError(coordinator, 'UnauthorizedWorker')
                .withArgs(nonWorker.address);
        });
    });

    // -------------------------------------------------------------------------
    // Test 4 — Mismatched payloadHash
    // -------------------------------------------------------------------------
    describe('Mismatched payloadHash', () => {
        it('should revert with PayloadHashMismatch when provided hash does not match keccak256(guid ++ message)', async () => {
            [owner, worker, nonWorker] = await ethers.getSigners();

            const HappyFactory = await ethers.getContractFactory('MockOFTReceiverHappy');
            const happyReceiver = await HappyFactory.deploy();

            const LibFactory = await ethers.getContractFactory('MockReceiveLib');
            const receiveLib = await LibFactory.deploy();

            const CoordFactory = await ethers.getContractFactory('AggLayerDVNCoordinator');
            const coordinator = await CoordFactory.deploy(
                owner.address,
                await receiveLib.getAddress(),
                await happyReceiver.getAddress(),
            );

            await coordinator.connect(owner).addWorker(worker.address);

            const packetHeader = buildPacketHeader(
                1,
                nonce,
                srcEid,
                sender,
                dstEid,
                await coordinator.getAddress(),
            );

            // Correct hash
            const correctHash = ethers.keccak256(
                ethers.concat([ethers.getBytes(guid), message]),
            );

            // Provide a deliberately wrong hash
            const wrongHash = ethers.hexlify(ethers.randomBytes(32));

            const originTuple = { srcEid, sender: sender as `0x${string}`, nonce };
            const claim = buildClaim();

            await expect(
                coordinator.connect(worker).claimAndVerify(
                    originTuple,
                    guid,
                    message,
                    claim,
                    packetHeader,
                    wrongHash,
                    confirmations,
                ),
            )
                .to.be.revertedWithCustomError(coordinator, 'PayloadHashMismatch')
                .withArgs(correctHash, wrongHash);
        });
    });
});
