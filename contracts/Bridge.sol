// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/DepositContract.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * This is totally a mock contract, there's just enough to test the proof of efficiency contract
 */
contract Bridge is Ownable, DepositContract {
    using SafeERC20 for IERC20;

    uint32 public constant MAINNET_NETWORK_ID = 0;

    // Rollup exit root, this will be updated every time a batch is verified
    bytes32 public lastRollupExitRoot;

    // Rollup exit root, this will be updated every time a deposit is made in mainnet
    bytes32 public lastMainnetExitRoot;

    // Store every global exit root
    mapping(uint256 => bytes32) public globalExitRootMap;

    // Current global exit roots stored
    uint256 public lastGlobalExitRootNum;

    // Rollup contract address
    address public rollupAddress;

    // Leaf index --> claimed
    mapping(uint256 => bool) public withdrawNullifier;

    /**
     * @dev Emitted when a deposit is added to the mainnet merkle tree
     */
    event DepositEvent(
        address tokenAddres,
        uint256 amount,
        uint32 destinationNetwork,
        address destinationAddress,
        uint32 depositCount
    );

    /**
     * @dev Emitted when a withdraw is done
     */
    event WithdrawEvent(
        uint64 index,
        uint32 originalNetwork,
        address token,
        uint256 amount,
        address destinationAddress
    );

    /**
     * @dev Emitted when the the global exit root is updated
     */
    event UpdateGlobalExitRoot(bytes32 mainnetExitRoot, bytes32 rollupExitRoot);

    /**
     * @param _rollupAddress Rollup contract address
     */
    constructor(address _rollupAddress) {
        rollupAddress = _rollupAddress;
        lastMainnetExitRoot = getDepositRoot();
        _updateGlobalExitRoot();
    }

    /**
     * @notice Add a new leaf to the mainnet merkle tree
     * @param token Token address, 0 address is reserved for ether
     * @param amount Amount of tokens
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     */
    function bridge(
        IERC20 token,
        uint256 amount,
        uint32 destinationNetwork,
        address destinationAddress
    ) public payable {
        // Transfer tokens or ether
        if (address(token) == address(0)) {
            require(
                msg.value == amount,
                "Bridge::deposit: AMOUNT_DOES_NOT_MATCH_MSG_VALUE"
            );
        } else {
            token.safeTransferFrom(msg.sender, address(this), amount);
        }

        require(
            destinationNetwork != MAINNET_NETWORK_ID,
            "Bridge::deposit: DESTINATION_CANT_BE_MAINNET"
        );

        emit DepositEvent(
            address(token),
            amount,
            destinationNetwork,
            destinationAddress,
            uint32(depositCount)
        );

        // Add new leaf to the mainnet merkle tree
        _deposit(
            address(token),
            amount,
            MAINNET_NETWORK_ID,
            destinationNetwork,
            destinationAddress
        );

        // Update mainnet root
        lastMainnetExitRoot = getDepositRoot();
        _updateGlobalExitRoot();
    }

    /**
     * @notice Verify merkle proof and claim tokens/ether
     * @param token  Token address, 0 address is reserved for ether
     * @param amount Amount of tokens
     * @param originalNetwork original network
     * @param destinationNetwork Network destination, must be 0 ( mainnet)
     * @param destinationAddress Address destination
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param globalExitRootNum Global exit root num
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     */
    function claim(
        address token,
        uint256 amount,
        uint32 originalNetwork,
        uint32 destinationNetwork,
        address destinationAddress,
        bytes32[] memory smtProof,
        uint64 index,
        uint256 globalExitRootNum,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot
    ) public {
        // Check nullifier
        require(
            withdrawNullifier[index] == false,
            "Bridge::withdraw: ALREADY_CLAIMED_WITHDRAW"
        );

        // Destination network must be mainnet
        require(
            destinationNetwork == MAINNET_NETWORK_ID,
            "Bridge::withdraw: DESTINATION_NETWORK_NOT_MAINNET"
        );

        // This should create wrapped erc20 tokens, for now not supported
        require(
            originalNetwork == MAINNET_NETWORK_ID,
            "Bridge::withdraw: ORIGIN_NETWORK_NOT_MAINNET"
        );

        // Check that the rollup exit root belongs to some global exit root
        require(
            keccak256(abi.encodePacked(mainnetExitRoot, rollupExitRoot)) ==
                globalExitRootMap[globalExitRootNum],
            "Bridge::withdraw: GLOBAL_EXIT_ROOT_DOES_NOT_MATCH"
        );

        require(
            verifyMerkleProof(
                token,
                amount,
                originalNetwork,
                destinationNetwork,
                destinationAddress,
                smtProof,
                index,
                rollupExitRoot
            ),
            "Bridge::withdraw: SMT_INVALID"
        );

        // Update nullifier
        withdrawNullifier[index] = true;

        // Transfer tokens or ether
        if (token == address(0)) {
            /* solhint-disable avoid-low-level-calls */
            (bool success, ) = destinationAddress.call{value: amount}(
                new bytes(0)
            );
            require(success, "Bridge::withdraw: ETH_TRANSFER_FAILED");
        } else {
            IERC20(token).safeTransfer(destinationAddress, amount);
        }

        emit WithdrawEvent(
            index,
            originalNetwork,
            token,
            amount,
            destinationAddress
        );
    }

    /**
     * @notice Update the rollup exit root
     */
    function updateRollupExitRoot(bytes32 newRollupExitRoot) public {
        require(
            msg.sender == rollupAddress,
            "Bridge::updateRollupExitRoot: ONLY_ROLLUP"
        );
        lastRollupExitRoot = newRollupExitRoot;
        _updateGlobalExitRoot();
    }

    /**
     * @notice Update the global exit root using the mainnet and rollup exit root
     */
    function _updateGlobalExitRoot() internal {
        lastGlobalExitRootNum++;
        globalExitRootMap[lastGlobalExitRootNum] = keccak256(
            abi.encodePacked(lastMainnetExitRoot, lastRollupExitRoot)
        );

        emit UpdateGlobalExitRoot(lastMainnetExitRoot, lastRollupExitRoot);
    }

    /**
     * @notice Return last global exit root
     */
    function getLastGlobalExitRoot() public view returns (bytes32) {
        return globalExitRootMap[lastGlobalExitRootNum];
    }
}
