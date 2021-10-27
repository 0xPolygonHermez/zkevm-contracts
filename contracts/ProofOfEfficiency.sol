// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./interfaces/VerifierRollupInterface.sol";

/**
 * Contract responsible for managing the state and the updates of it of the L2 Hermez network.
 * There will be sequencer, wich are able to send transactions. That transactions will be stored in the contract.
 * The aggregators are forced to process and validate the sequencers transactions in the same order by using a verifier.
 * To enter and exit of the L2 network will be used a Bridge smart contract
 */
contract ProofOfEfficiency is Ownable {
    using SafeERC20 for IERC20;

    struct Sequencer {
        string sequencerURL;
        uint256 chainID;
    }

    struct BatchData {
        address sequencerAddress;
        bytes32 batchL2HashData;
        uint256 maticCollateral;
    }

    // bytes4(keccak256(bytes("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")));
    bytes4 private constant _PERMIT_SIGNATURE = 0xd505accf;

    // Modulus zkSNARK
    uint256 private constant _RFIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // MATIC token address
    IERC20 public immutable matic;

    // Mapping of registered sequencers
    mapping(address => Sequencer) public sequencers;

    // Current registered sequencers
    uint256 public numSequencers;

    // Last batch sent by the sequencers
    uint256 public lastBatchSent;

    // Mapping of sent batches with their associated data
    mapping(uint256 => BatchData) public sentBatches;

    // Last batch verified by the aggregators
    uint256 public lastVerifiedBatch;

    // Bridge address
    address public bridgeAddress;

    // Current state root
    uint256 public currentStateRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Current local exit root
    uint256 public currentLocalExitRoot; // TODO should be a map stateRootMap[lastForgedBatch]???

    // Last fetched global exit root, this will be updated every time a batch is verified
    uint256 public lastGlobalExitRoot;

    VerifierRollupInterface public rollupVerifier;

    /**
     * @dev Emitted when a sequencer is registered or updated
     */
    event SetSequencer(address sequencerAddress, string sequencerURL);

    /**
     * @dev Emitted when a sequencer sends a new batch of transactions
     */
    event SendBatch(uint256 indexed batchNum, address indexed sequencer);

    /**
     * @dev Emitted when the owner increases the timeout
     */
    event NewWithdrawTimeout(uint256 newWithdrawTimeout);

    /**
     * @param _bridgeAddress Bridge contract address
     */
    constructor(
        address _bridgeAddress,
        IERC20 _matic,
        VerifierRollupInterface _rollupVerifier
    ) {
        bridgeAddress = _bridgeAddress;
        matic = _matic;
        rollupVerifier = _rollupVerifier;

        // register this rollup and update the global exit root
        // Bridge.registerRollup(currentLocalExitRoot)
        // lastGlobalExitRoot = Bridge.globalExitRoot
    }

    /**
     * @notice Allows to register a new sequencer or update the sequencer URL
     * @param sequencerURL sequencer RPC URL
     */
    function registerSequencer(string memory sequencerURL) public {
        require(
            bytes(sequencerURL).length != 0,
            "ProofOfEfficiency::registerSequencer: NOT_VALID_URL"
        );

        if (sequencers[msg.sender].chainID == 0) {
            // New sequencer is registered
            numSequencers++;
            sequencers[msg.sender].sequencerURL = sequencerURL;
            sequencers[msg.sender].chainID = numSequencers;
        } else {
            // Sequencer already exist, update the URL
            sequencers[msg.sender].sequencerURL = sequencerURL;
        }
        emit SetSequencer(msg.sender, sequencerURL);
    }

    /**
     * @notice Allows a sequencer to send a batch of L2 transactions
     * @param transactions L2 ethereum transactions EIP-155 with signature:
     * rlp(nonce, gasprice, gasLimit, to, value, data, chainid, 0, 0, v, r, s)
     * @param maticAmount Max amount of MATIC tokens that the sequencer is willing to pay
     * @param _permitData Raw data of the call `permit` of the token
     */
    function sendBatch(
        bytes memory transactions,
        uint256 maticAmount,
        bytes calldata _permitData
    ) public {
        // calculate matic collateral
        uint256 maticCollateral = calculateSequencerCollateral(
            transactions.length //TODO   how many transactions are here¿?¿?¿??¿?¿¿?¿?
        );

        require(
            maticCollateral <= maticAmount,
            "ProofOfEfficiency::sendBatch: NOT_ENOUGH_MATIC"
        );

        // receive MATIC tokens
        if (_permitData.length != 0) {
            _permit(address(matic), maticAmount, _permitData);
        }
        matic.safeTransferFrom(msg.sender, address(this), maticCollateral);

        // Update sentBatches mapping
        lastBatchSent++;
        sentBatches[lastBatchSent].batchL2HashData = keccak256(transactions);
        sentBatches[lastBatchSent].maticCollateral = maticCollateral;

        // check if the sequencer is registered, if not, no one will claim the fees
        if (sequencers[msg.sender].chainID != 0) {
            sentBatches[lastBatchSent].sequencerAddress = msg.sender;
        }

        emit SendBatch(lastBatchSent, msg.sender);
    }

    /**
     * @notice Allows an aggregator to verify a batch
     * @param newLocalExitRoot  New local exit root once the batch is processed
     * @param newStateRoot New State root once the batch is processed
     * @param batchNum Batch number that the aggregator intends to verify, used as a sanity check
     * @param proofA zk-snark input
     * @param proofB zk-snark input
     * @param proofC zk-snark input
     */
    function verifyBatch(
        uint256 newLocalExitRoot,
        uint256 newStateRoot,
        uint256 batchNum,
        uint256[2] calldata proofA,
        uint256[2][2] calldata proofB,
        uint256[2] calldata proofC
    ) public {
        // sanity check
        require(
            batchNum == lastVerifiedBatch + 1,
            "ProofOfEfficiency::verifyBatch: BATCH_DOES_NOT_MATCH"
        );

        BatchData memory currentBatch = sentBatches[batchNum];
        address sequencerAddress = currentBatch.sequencerAddress;
        uint256 batchChainID = sequencers[sequencerAddress].chainID;
        uint256 input = uint256(
            sha256(
                abi.encodePacked(
                    currentStateRoot,
                    currentLocalExitRoot,
                    lastGlobalExitRoot,
                    newStateRoot,
                    newLocalExitRoot,
                    sequencerAddress,
                    currentBatch.batchL2HashData,
                    batchChainID // could be 0, is that alright?
                )
            )
        ) % _RFIELD;

        // verify proof
        require(
            rollupVerifier.verifyProof(proofA, proofB, proofC, [input]),
            "ProofOfEfficiency::verifyBatch: INVALID_PROOF"
        );
        // update state
        lastVerifiedBatch++;
        currentStateRoot = newStateRoot;
        currentLocalExitRoot = newLocalExitRoot;

        // Bridge.updateExitRoot(currentLocalExitRoot)
        // lastGlobalExitRoot = Bridge.globalExitRoot
    }

    /**
     * @notice Function to calculate the sequencer collateral depending on how many transactions are sent 
     // TODO
     * @param transactionNum Number of transactions
     */
    function calculateSequencerCollateral(uint256 transactionNum)
        public
        pure
        returns (uint256)
    {
        return transactionNum * 1 ether;
    }

    /**
     * @notice Function to extract the selector of a bytes calldata
     * @param _data The calldata bytes
     */
    function _getSelector(bytes memory _data)
        private
        pure
        returns (bytes4 sig)
    {
        /* solhint-disable no-inline-assembly*/
        assembly {
            sig := mload(add(_data, 32))
        }
    }

    /**
     * @notice Function to call token permit method of extended ERC20
     + @param token ERC20 token address
     * @param _amount Quantity that is expected to be allowed
     * @param _permitData Raw data of the call `permit` of the token
     */
    function _permit(
        address token,
        uint256 _amount,
        bytes calldata _permitData
    ) internal returns (bool success, bytes memory returndata) {
        bytes4 sig = _getSelector(_permitData);
        require(
            sig == _PERMIT_SIGNATURE,
            "HezMaticMerge::_permit: NOT_VALID_CALL"
        );
        (
            address owner,
            address spender,
            uint256 value,
            uint256 deadline,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) = abi.decode(
                _permitData[4:],
                (address, address, uint256, uint256, uint8, bytes32, bytes32)
            );
        require(
            owner == msg.sender,
            "HezMaticMerge::_permit: PERMIT_OWNER_MUST_BE_THE_SENDER"
        );
        require(
            spender == address(this),
            "HezMaticMerge::_permit: SPENDER_MUST_BE_THIS"
        );
        require(
            value == _amount,
            "HezMaticMerge::_permit: PERMIT_AMOUNT_DOES_NOT_MATCH"
        );

        // we call without checking the result, in case it fails and he doesn't have enough balance
        // the following transferFrom should be fail. This prevents DoS attacks from using a signature
        // before the smartcontract call
        /* solhint-disable avoid-low-level-calls*/
        return
            address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE,
                    owner,
                    spender,
                    value,
                    deadline,
                    v,
                    r,
                    s
                )
            );
    }
}
