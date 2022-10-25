// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.15;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "./interfaces/IVerifierRollup.sol";
import "./interfaces/IGlobalExitRootManager.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue
 * THe sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof
 * The aggregators will be able to actually verify the sequenced state with zkProofs and be to perform withdrawals from L2 network
 * To enter and exit of the L2 network will be used a Bridge smart contract that will be deployed in both networks
 */
contract ProofOfEfficiency is Initializable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @notice Struct which will be used to call sequenceBatches
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0,) || v || r || s
     * pre-EIP-155: rlp(nonce, gasprice, gasLimit, to, value, data) || v || r || s
     * @param globalExitRoot Global exit root of the batch
     * @param timestamp Timestamp of the batch
     * @param minForcedTimestamp Minimum timestamp of the force batch data, empty when non forced batch
     */
    struct BatchData {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 timestamp;
        uint64 minForcedTimestamp;
    }

    /**
     * @notice Struct which will be used to call sequenceForceBatches
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * @param globalExitRoot Global exit root of the batch
     * @param minForcedTimestamp Minimum timestamp of the force batch data
     */
    struct ForceBatchData {
        bytes transactions;
        bytes32 globalExitRoot;
        uint64 minForcedTimestamp;
    }

    // Modulus zkSNARK
    uint256 internal constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // MATIC token address
    IERC20Upgradeable public matic;

    // trusted sequencer prover Fee
    uint256 public constant TRUSTED_SEQUENCER_FEE = 0.1 ether; // TODO should be defined

    // Max batch byte length
    // Max keccaks circuit = (2**23 / 158418) * 9 = 468
    // Bytes per keccak = 136
    // Minimum Static keccaks batch = 4
    // Max bytes allowed = (468 - 4) * 136 = 63104 bytes - 1 byte padding
    // Rounded to 60000 bytes
    uint256 public constant MAX_BATCH_LENGTH = 60000;

    // Force batch timeout
    uint64 public constant FORCE_BATCH_TIMEOUT = 7 days;

    // Byte length of the sha256 that will be used as a input of the snark
    // SHA256(oldStateRoot, newStateRoot, oldAccInputHash, newAccInputHash, newLocalExitRoot, oldNumBatch, newNumBatch, chainID, aggrAddress)
    // 8 Fields * 8 Bytes (Stark input in Field Array form) * 5 (hashes), + 8 bytes * 3 (oldNumBatch, newNumBatch, chainID) + 20 bytes (aggrAddress)
    uint256 internal constant _SNARK_SHA_BYTES = 364;

    // Queue of forced batches with their associated data
    // ForceBatchNum --> hashedForceBatchData
    // hashedForceBatchData: hash containing the necessary information to force a batch:
    // keccak256(keccak256(bytes transactions), bytes32 globalExitRoot, unint64 minTimestamp)
    mapping(uint64 => bytes32) public forcedBatches;

    // Queue of batches that defines the virtual state
    // SequenceBatchNum --> accInputHash
    // accInputHash: hash chain that contains all the information to process a batch:
    // keccak256(bytes32 oldAccInputHash, keccak256(bytes transactions), bytes32 globalExitRoot, uint64 timestamp, address seqAddress)
    mapping(uint64 => bytes32) public sequencedBatches;

    // Last sequenced timestamp
    uint64 public lastTimestamp;

    // Last batch sent by the sequencers
    uint64 public lastBatchSequenced;

    // Last forced batch included in the sequence
    uint64 public lastForceBatchSequenced;

    // Last forced batch
    uint64 public lastForceBatch;

    // Last batch verified by the aggregators
    uint64 public lastVerifiedBatch;

    // Trusted sequencer address
    address public trustedSequencer;

    // Indicates whether the force batch functionality is available
    bool public forceBatchAllowed;

    // Global Exit Root interface
    IGlobalExitRootManager public globalExitRootManager;

    // Current state root
    bytes32 public currentStateRoot;

    // Rollup verifier interface
    IVerifierRollup public rollupVerifier;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 chain identifier
    uint64 public chainID;

    // L2 network name
    string public networkName;

    /**
     * @dev Emitted when the trusted sequencer sends a new batch of transactions
     */
    event SequenceBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted when a batch is forced
     */
    event ForceBatch(
        uint64 indexed forceBatchNum,
        bytes32 lastGlobalExitRoot,
        address sequencer,
        bytes transactions
    );

    /**
     * @dev Emitted when forced batches are sequenced by not the trusted sequencer
     */
    event SequenceForceBatches(uint64 indexed numBatch);

    /**
     * @dev Emitted when a aggregator verifies a new batch
     */
    event VerifyBatches(uint64 indexed numBatch, address indexed aggregator);

    /**
     * @dev Emitted when a trusted sequencer update his address
     */
    event SetTrustedSequencer(address newTrustedSequencer);

    /**
     * @dev Emitted when a trusted sequencer update the forcebatch boolean
     */
    event SetForceBatchAllowed(bool newForceBatchAllowed);

    /**
     * @dev Emitted when a trusted sequencer update his URL
     */
    event SetTrustedSequencerURL(string newTrustedSequencerURL);

    /**
     * @param _globalExitRootManager global exit root manager address
     * @param _matic MATIC token address
     * @param _rollupVerifier rollup verifier address
     * @param genesisRoot rollup genesis root
     * @param _trustedSequencer trusted sequencer address
     * @param _forceBatchAllowed indicates wheather the force batch functionality is available
     * @param _trustedSequencerURL trusted sequencer URL
     * @param _chainID L2 chainID
     * @param _networkName L2 network name
     */
    function initialize(
        IGlobalExitRootManager _globalExitRootManager,
        IERC20Upgradeable _matic,
        IVerifierRollup _rollupVerifier,
        bytes32 genesisRoot,
        address _trustedSequencer,
        bool _forceBatchAllowed,
        string memory _trustedSequencerURL,
        uint64 _chainID,
        string memory _networkName
    ) public virtual initializer {
        globalExitRootManager = _globalExitRootManager;
        matic = _matic;
        rollupVerifier = _rollupVerifier;
        currentStateRoot = genesisRoot;
        trustedSequencer = _trustedSequencer;
        forceBatchAllowed = _forceBatchAllowed;
        trustedSequencerURL = _trustedSequencerURL;
        chainID = _chainID;
        networkName = _networkName;
    }

    modifier onlyTrustedSequencer() {
        require(
            trustedSequencer == msg.sender,
            "ProofOfEfficiency::onlyTrustedSequencer: only trusted sequencer"
        );
        _;
    }

    // Only for the current version
    modifier isForceBatchAllowed() {
        require(
            forceBatchAllowed == true,
            "ProofOfEfficiency::isForceBatchAllowed: only if force batch is available"
        );
        _;
    }

    /**
     * @notice Allows a sequencer to send multiple batches
     * @param batches Struct array which the necessary data to append new batces ot the sequence
     */
    function sequenceBatches(BatchData[] memory batches)
        public
        onlyTrustedSequencer
    {
        uint256 batchesNum = batches.length;

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentTimestamp = lastTimestamp;
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = sequencedBatches[currentBatchSequenced];

        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            BatchData memory currentBatch = batches[i];

            // Check if it's a forced batch
            if (currentBatch.minForcedTimestamp > 0) {
                currentLastForceBatchSequenced++;

                // Check forced data matches
                bytes32 hashedForceBatchData = keccak256(
                    abi.encodePacked(
                        keccak256(currentBatch.transactions),
                        currentBatch.globalExitRoot,
                        currentBatch.minForcedTimestamp
                    )
                );

                require(
                    hashedForceBatchData ==
                        forcedBatches[currentLastForceBatchSequenced],
                    "ProofOfEfficiency::sequenceBatches: Forced batches data must match"
                );

                // Check timestamp is bigger than min timestamp
                require(
                    currentBatch.timestamp >= currentBatch.minForcedTimestamp,
                    "ProofOfEfficiency::sequenceBatches: Forced batches timestamp must be bigger or equal than min"
                );
            } else {
                // Check global exit root exist, and proper batch length, this checks are already done in the force Batches call
                require(
                    currentBatch.globalExitRoot == bytes32(0) ||
                        globalExitRootManager.globalExitRootMap(
                            currentBatch.globalExitRoot
                        ) !=
                        0,
                    "ProofOfEfficiency::sequenceBatches: Global exit root must exist"
                );

                require(
                    currentBatch.transactions.length < MAX_BATCH_LENGTH,
                    "ProofOfEfficiency::sequenceBatches: Transactions bytes overflow"
                );
            }

            // Check Batch parameters are correct
            require(
                currentBatch.timestamp >= currentTimestamp &&
                    currentBatch.timestamp <= block.timestamp,
                "ProofOfEfficiency::sequenceBatches: Timestamp must be inside range"
            );

            // Calculate next acc input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    keccak256(currentBatch.transactions),
                    currentBatch.globalExitRoot,
                    currentBatch.timestamp,
                    msg.sender
                )
            );

            // Update currentBatchSequenced
            currentBatchSequenced++;

            // Update timestamp
            currentTimestamp = currentBatch.timestamp;
        }

        // Sanity check, should not be unreachable
        require(
            currentLastForceBatchSequenced <= lastForceBatch,
            "ProofOfEfficiency::sequenceBatches: Force batches overflow"
        );

        uint256 nonForcedBatchesSequenced = batchesNum -
            (currentLastForceBatchSequenced - lastForceBatchSequenced);

        // Store back the storage variables
        lastTimestamp = currentTimestamp;
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;
        sequencedBatches[currentBatchSequenced] = currentAccInputHash;

        // Pay collateral for every batch submitted
        matic.safeTransferFrom(
            msg.sender,
            address(this),
            TRUSTED_SEQUENCER_FEE * nonForcedBatchesSequenced
        );

        emit SequenceBatches(lastBatchSequenced);
    }

    /**
     * @notice Allows an aggregator to verify a batch
     * @param _lastVerifiedBatch Last verified Batch, used as a sanity check
     * @param newVerifiedBatch Last batch that the aggregator intends to verify
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function verifyBatches(
        uint64 _lastVerifiedBatch,
        uint64 newVerifiedBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public {
        // sanity check
        require(
            _lastVerifiedBatch == lastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: _lastVerifiedBatch does not match"
        );

        require(
            newVerifiedBatch > _lastVerifiedBatch,
            "ProofOfEfficiency::verifyBatches: newVerifiedBatch must be bigger than lastVerifiedBatch"
        );

        require(
            newVerifiedBatch <= lastBatchSequenced,
            "ProofOfEfficiency::verifyBatches: batch does not have been sequenced"
        );

        bytes memory snarkHashBytes = getInputSnarkBytes(
            _lastVerifiedBatch,
            newVerifiedBatch,
            newLocalExitRoot,
            newStateRoot
        );

        // Calulate the snark input
        uint256 inputSnark = uint256(sha256(snarkHashBytes)) % _RFIELD;

        // Verify proof
        require(
            rollupVerifier.verifyProof(proofA, proofB, proofC, [inputSnark]),
            "ProofOfEfficiency::verifyBatches: INVALID_PROOF"
        );

        // Get MATIC reward
        matic.safeTransfer(
            msg.sender,
            calculateRewardPerBatch() * (newVerifiedBatch - _lastVerifiedBatch)
        );

        // Update state
        lastVerifiedBatch = newVerifiedBatch;
        currentStateRoot = newStateRoot;

        // Interact with globalExitRoot
        globalExitRootManager.updateExitRoot(newLocalExitRoot);

        emit VerifyBatches(newVerifiedBatch, msg.sender);
    }

    /**
     * @notice Allows a sequencer/user to force a batch of L2 transactions.
     * This should be used only in extreme cases where the trusted sequencer does not work as expected
     * @param transactions L2 ethereum transactions EIP-155 or pre-EIP-155 with signature:
     * @param maticAmount Max amount of MATIC tokens that the sender is willing to pay
     */
    function forceBatch(bytes memory transactions, uint256 maticAmount)
        public
        isForceBatchAllowed
    {
        // Calculate matic collateral
        uint256 maticFee = calculateForceProverFee();

        require(
            maticFee <= maticAmount,
            "ProofOfEfficiency::forceBatch: not enough matic"
        );

        require(
            transactions.length < MAX_BATCH_LENGTH,
            "ProofOfEfficiency::forceBatch: Transactions bytes overflow"
        );

        matic.safeTransferFrom(msg.sender, address(this), maticFee);

        // Get globalExitRoot global exit root
        bytes32 lastGlobalExitRoot = globalExitRootManager
            .getLastGlobalExitRoot();

        // Update forcedBatches mapping
        lastForceBatch++;

        forcedBatches[lastForceBatch] = keccak256(
            abi.encodePacked(
                keccak256(transactions),
                lastGlobalExitRoot,
                uint64(block.timestamp)
            )
        );

        // In order to avoid synch attacks, if the msg.sender is not the origin
        // Add the transaction bytes in the event
        if (msg.sender == tx.origin) {
            emit ForceBatch(lastForceBatch, lastGlobalExitRoot, msg.sender, "");
        } else {
            emit ForceBatch(
                lastForceBatch,
                lastGlobalExitRoot,
                msg.sender,
                transactions
            );
        }
    }

    /**
     * @notice Allows anyone to sequence forced Batches if the trusted sequencer do not have done it in the timeout period
     * @param batches Struct array which the necessary data to append new batces ot the sequence
     */
    function sequenceForceBatches(ForceBatchData[] memory batches)
        public
        isForceBatchAllowed
    {
        uint256 batchesNum = batches.length;

        require(
            batchesNum > 0,
            "ProofOfEfficiency::sequenceForceBatch: Must force at least 1 batch"
        );

        require(
            lastForceBatchSequenced + batchesNum <= lastForceBatch,
            "ProofOfEfficiency::sequenceForceBatch: Force batch invalid"
        );

        // Store storage variables in memory, to save gas, because will be overrided multiple times
        uint64 currentBatchSequenced = lastBatchSequenced;
        uint64 currentLastForceBatchSequenced = lastForceBatchSequenced;
        bytes32 currentAccInputHash = sequencedBatches[currentBatchSequenced];

        // Sequence force batches
        for (uint256 i = 0; i < batchesNum; i++) {
            // Load current sequence
            ForceBatchData memory currentBatch = batches[i];
            currentLastForceBatchSequenced++;

            // Check forced data matches
            bytes32 hashedForceBatchData = keccak256(
                abi.encodePacked(
                    keccak256(currentBatch.transactions),
                    currentBatch.globalExitRoot,
                    currentBatch.minForcedTimestamp
                )
            );

            require(
                hashedForceBatchData ==
                    forcedBatches[currentLastForceBatchSequenced],
                "ProofOfEfficiency::sequenceForceBatches: Forced batches data must match"
            );

            if (i == (batchesNum - 1)) {
                // The last batch will have the most restrictive timestamp
                require(
                    currentBatch.minForcedTimestamp + FORCE_BATCH_TIMEOUT <=
                        block.timestamp,
                    "ProofOfEfficiency::sequenceForceBatch: Forced batch is not in timeout period"
                );
            }
            // Calculate next acc input hash
            currentAccInputHash = keccak256(
                abi.encodePacked(
                    currentAccInputHash,
                    keccak256(currentBatch.transactions),
                    currentBatch.globalExitRoot,
                    uint64(block.timestamp),
                    msg.sender
                )
            );

            // Update currentBatchSequenced
            currentBatchSequenced++;
        }

        lastTimestamp = uint64(block.timestamp);

        // Store back the storage variables
        lastBatchSequenced = currentBatchSequenced;
        lastForceBatchSequenced = currentLastForceBatchSequenced;
        sequencedBatches[currentBatchSequenced] = currentAccInputHash;

        emit SequenceForceBatches(lastBatchSequenced);
    }

    /**
     * @notice Allow the current trusted sequencer to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequuencer
     */
    function setTrustedSequencer(address newTrustedSequencer)
        public
        onlyTrustedSequencer
    {
        trustedSequencer = newTrustedSequencer;

        emit SetTrustedSequencer(newTrustedSequencer);
    }

    /**
     * @notice Allow the current trusted sequencer to allow/disallow the forceBatch functionality
     * @param newForceBatchAllowed Whether is allowed or not the forceBatch functionality
     */
    function setForceBatchAllowed(bool newForceBatchAllowed)
        public
        onlyTrustedSequencer
    {
        forceBatchAllowed = newForceBatchAllowed;

        emit SetForceBatchAllowed(newForceBatchAllowed);
    }

    /**
     * @notice Allow the trusted sequencer to set the trusted sequencer URL
     * @param newTrustedSequencerURL URL of trusted sequencer
     */
    function setTrustedSequencerURL(string memory newTrustedSequencerURL)
        public
        onlyTrustedSequencer
    {
        trustedSequencerURL = newTrustedSequencerURL;

        emit SetTrustedSequencerURL(newTrustedSequencerURL);
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on the congestion of the batches
     // TODO
     */
    function calculateForceProverFee() public view returns (uint256) {
        return 1 ether * uint256(1 + lastForceBatch - lastForceBatchSequenced);
    }

    /**
     * @notice Function to calculate the reward to verify a single batch
     */
    function calculateRewardPerBatch() public view returns (uint256) {
        uint256 currentBalance = matic.balanceOf(address(this));

        // Total Sequenced Batches = forcedBatches to be sequenced (total forced Batches - sequenced Batches) + sequencedBatches
        // Total Batches to be verified = Total Sequenced Batches - verified Batches
        uint256 totalBatchesToVerify = ((lastForceBatch -
            lastForceBatchSequenced) + lastBatchSequenced) - lastVerifiedBatch;
        return currentBalance / totalBatchesToVerify;
    }

    function getInputSnarkBytes(
        uint64 _lastVerifiedBatch,
        uint64 newVerifiedBatch,
        bytes32 newLocalExitRoot,
        bytes32 newStateRoot
    ) public view returns (bytes memory) {
        bytes32 oldAccInputHash = sequencedBatches[_lastVerifiedBatch];
        bytes32 newAccInputHash = sequencedBatches[newVerifiedBatch];

        require(
            newAccInputHash != bytes32(0),
            "ProofOfEfficiency::getInputSnarkBytes: newAccInputHash does not exist"
        );

        bytes memory snarkHashBytes;
        assembly {
            // Set snarkHashBytes to the next free memory pointer
            snarkHashBytes := mload(0x40)

            // Reserve the memory. 32 for the length , the input bytes and 32
            // extra bytes at the end for word manipulation
            mstore(0x40, add(add(snarkHashBytes, 0x40), _SNARK_SHA_BYTES))

            // Set the actual length of the input bytes
            mstore(snarkHashBytes, _SNARK_SHA_BYTES)

            // Set the pointer at the beginning of the byte array
            let ptr := add(snarkHashBytes, 32)

            // Function defined to add 32 bytes into the snark btye array on a prover friendly method
            function add32BytesToInputSnark(bytesToAdd, ptrInit) -> ptrFinal {
                ptrFinal := ptrInit
                for {
                    let i := 0
                } lt(i, 8) {
                    i := add(i, 1)
                } {
                    // Every iteration will write 4 bytes (32 bits) from inputStark padded to 8 bytes, in little endian format
                    // First shift right i*32 bits, in order to have the next 4 bytes to write at the end of the byte array
                    // Then shift left 256 - 32 (224) bits to the left.
                    // As a result the first 4 bytes will be the next ones, and the rest of the bytes will be zeroes
                    // Finally the result is shifted 32 bits for the padding, and stores in the current position of the pointer
                    mstore(
                        ptrFinal,
                        shr(32, shl(224, shr(mul(i, 32), bytesToAdd)))
                    )
                    ptrFinal := add(ptrFinal, 8) // write the next 8 bytes
                }
            }

            // Add currentStateRoot
            ptr := add32BytesToInputSnark(sload(currentStateRoot.slot), ptr)

            // Add newStateRoot
            ptr := add32BytesToInputSnark(newStateRoot, ptr)

            // Add oldAccInputHash
            ptr := add32BytesToInputSnark(oldAccInputHash, ptr)

            // Add newAccInputHash
            ptr := add32BytesToInputSnark(newAccInputHash, ptr)

            // Add newLocalExitRoot
            ptr := add32BytesToInputSnark(newLocalExitRoot, ptr)

            // add firstNumBatch
            mstore(ptr, shl(192, _lastVerifiedBatch)) // 256 - 64 = 192
            ptr := add(ptr, 8)

            // add lastNumBatch
            mstore(ptr, shl(192, newVerifiedBatch)) // 256 - 64 = 192
            ptr := add(ptr, 8)

            // add chainID
            mstore(ptr, shl(192, sload(chainID.slot))) // 256 - 64 = 192
            ptr := add(ptr, 8)

            // add aggregator address
            mstore(ptr, shl(96, caller())) // 256 - 160 = 96
            ptr := add(ptr, 20)
        }
        return snarkHashBytes;
    }
}
