// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/DepositContract.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./lib/TokenWrappedL2.sol";

// clones!!
/**
 * Bridge that will be deployed on L2 in the Zk-EVM
 * For now only supports mainnet
 */
contract BridgeL2 is Ownable, DepositContract {
    using SafeERC20 for IERC20;

    // Token information struct
    struct TokenInformation {
        uint32 originalNetwork;
        address originalTokenAddress;
    }

    uint32 public constant MAINNET_NETWORK_ID = 0;

    // Special circuit variables

    // Store every global exit root, this will be updated by the circuit every batch
    mapping(uint256 => bytes32) public globalExitRootMap;

    // Current global exit roots stored, this will be updated by the circuit every batch, could be blockNum?
    uint256 public lastGlobalExitRootNum;

    // Regular variables

    // Network identifier
    uint32 public networkID;

    // Rollup exit root,
    bytes32 public lastLocalExitRoot;

    // Leaf index --> claimed
    mapping(uint256 => bool) public withdrawNullifier;

    // keccak256(OriginalNetwork || tokenAddress) --> L2 token address
    mapping(bytes32 => address) public tokenInfoToAddress;

    // L2 token Address --> original token information
    mapping(address => TokenInformation) public addressToTokenInfo;

    /**
     * @param _networkID networkID
     */
    constructor(uint32 _networkID) {
        networkID = _networkID;
    }

    /**
     * @dev Emitted when a bridge some tokens to another network
     */
    event BridgeEvent(
        address tokenAddres,
        uint256 amount,
        uint32 originNetwork,
        uint32 destinationNetwork,
        address destinationAddress,
        uint32 depositCount
    );

    /**
     * @dev Emitted when a claim is done from another network
     */
    event ClaimEvent(
        uint64 index,
        uint32 originalNetwork,
        address token,
        uint256 amount,
        address destinationAddress
    );

    /**
     * @dev Emitted when a a new wrapped token is created
     */
    event NewWrappedToken(
        uint32 originalNetwork,
        address originalTokenAddress,
        address wrappedTokenAddress
    );

    /**
     * @dev Emitted when the rollup updates the exit root
     */
    event UpdateRollupRootEvent(bytes32 rollupExitRoot);

    /**
     * @notice Deposit add a new leaf to the merkle tree
     * @param token Token address, 0 address is reserved for ether
     * @param amount Amount of tokens
     * @param destinationNetwork Network destination
     * @param destinationAddress Address destination
     */
    function bridge(
        address token,
        uint256 amount,
        uint32 destinationNetwork,
        address destinationAddress
    ) public payable {
        require(
            destinationNetwork != networkID,
            "Bridge::deposit: DESTINATION_CANT_BE_ITSELF"
        );

        address originalTokenAddress;
        uint32 originNetwork;

        if (token == address(0)) {
            // Ether transfer
            require(
                msg.value == amount,
                "Bridge::deposit: AMOUNT_DOES_NOT_MATCH_MSG_VALUE"
            );

            // Ether is counted as ether from mainnet
            // originalTokenAddress is 0 since it's ether
            originNetwork = MAINNET_NETWORK_ID;
        } else {
            TokenInformation memory tokenInfo = addressToTokenInfo[token];

            if (tokenInfo.originalTokenAddress != address(0)) {
                // The token is a wrapped token from another network

                // Burn tokens
                TokenWrappedL2(token).burn(msg.sender, amount);

                originalTokenAddress = tokenInfo.originalTokenAddress;
                originNetwork = tokenInfo.originalNetwork;
            } else {
                // The token is from this network.
                IERC20(token).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amount
                );

                originalTokenAddress = token;
                originNetwork = networkID;
            }
        }

        emit BridgeEvent(
            address(token),
            amount,
            originNetwork,
            destinationNetwork,
            destinationAddress,
            uint32(depositCount)
        );

        _deposit(
            originalTokenAddress,
            amount,
            originNetwork,
            destinationNetwork,
            destinationAddress
        );

        // Update local exit root
        lastLocalExitRoot = getDepositRoot();
    }

    /**
     * @notice Verify merkle proof and withdraw tokens/ether
     * @param originalTokenAddress  Original token address, 0 address is reserved for ether
     * @param amount Amount of tokens
     * @param originalNetwork Original network
     * @param destinationNetwork Network destination, must be 0 ( mainnet)
     * @param destinationAddress Address destination
     * @param smtProof Smt proof
     * @param index Index of the leaf
     * @param globalExitRootNum Global exit root num
     * @param mainnetExitRoot Mainnet exit root
     * @param localExitRoot Rollup exit root
     */
    function claim(
        address originalTokenAddress,
        uint256 amount,
        uint32 originalNetwork,
        uint32 destinationNetwork,
        address destinationAddress,
        bytes32[] memory smtProof,
        uint64 index,
        uint256 globalExitRootNum,
        bytes32 mainnetExitRoot,
        bytes32 localExitRoot
    ) public {
        // Check nullifier
        require(
            withdrawNullifier[index] == false,
            "Bridge::withdraw: ALREADY_CLAIMED_WITHDRAW"
        );

        // Destination network must be mainnet
        require(
            destinationNetwork == networkID,
            "Bridge::withdraw: DESTINATION_NETWORK_NOT_MAINNET"
        );

        // Check that the merkle proof belongs to some global exit root
        require(
            keccak256(abi.encodePacked(mainnetExitRoot, localExitRoot)) ==
                globalExitRootMap[globalExitRootNum],
            "Bridge::withdraw: GLOBAL_EXIT_ROOT_DOES_NOT_MATCH"
        );

        // Verify merkle proof
        require(
            verifyMerkleProof(
                originalTokenAddress,
                amount,
                originalNetwork,
                destinationNetwork,
                destinationAddress,
                smtProof,
                index,
                mainnetExitRoot
            ),
            "Bridge::withdraw: SMT_INVALID"
        );

        // Update nullifier
        withdrawNullifier[index] = true;

        // Transfer funds
        if (originalTokenAddress == address(0)) {
            // Transfer ether
            /* solhint-disable avoid-low-level-calls */
            (bool success, ) = destinationAddress.call{value: amount}(
                new bytes(0)
            );
            require(success, "Bridge::withdraw: ETH_TRANSFER_FAILED");
        } else {
            // Transfer tokens
            if (originalNetwork == networkID) {
                // The token is an ERC20 from this network
                IERC20(originalTokenAddress).safeTransfer(
                    destinationAddress,
                    amount
                );
            } else {
                // The tokens is not from this network
                // Create a wrapper for the token if not exist yet
                address wrappedToken = tokenInfoToAddress[
                    keccak256(
                        abi.encodePacked(originalNetwork, originalTokenAddress)
                    )
                ];
                if (wrappedToken == address(0)) {
                    // Create a new wrapped erc20
                    TokenWrappedL2 newWrappedToken = new TokenWrappedL2(
                        "name",
                        "symbol",
                        destinationAddress,
                        amount
                    );

                    // Create mappings
                    tokenInfoToAddress[
                        keccak256(
                            abi.encodePacked(
                                originalNetwork,
                                originalTokenAddress
                            )
                        )
                    ] = address(newWrappedToken);

                    addressToTokenInfo[
                        address(newWrappedToken)
                    ] = TokenInformation(originalNetwork, originalTokenAddress);

                    emit NewWrappedToken(
                        originalNetwork,
                        originalTokenAddress,
                        address(newWrappedToken)
                    );
                } else {
                    // Use the existing wrapped erc20
                    TokenWrappedL2(wrappedToken).mint(
                        destinationAddress,
                        amount
                    );
                }
            }
        }

        emit ClaimEvent(
            index,
            originalNetwork,
            originalTokenAddress,
            amount,
            destinationAddress
        );
    }

    /**
     * @notice Return last global exit root
     */
    function getLastGlobalExitRoot() public view returns (bytes32) {
        return globalExitRootMap[lastGlobalExitRootNum];
    }
}
