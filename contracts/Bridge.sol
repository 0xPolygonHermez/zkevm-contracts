// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./lib/DepositContract.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./lib/TokenWrapped.sol";
import "./interfaces/IGlobalExitRootManager.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * Bridge that will be deployed on both networks Ethereum and Polygon Hermez
 * Contract responsible to manage the token interactions with other networks
 */
contract Bridge is Ownable, DepositContract {
    using SafeERC20 for IERC20;

    // Token information struct
    struct TokenInformation {
        uint32 originalNetwork;
        address originalTokenAddress;
    }

    // Mainnet indentifier
    uint32 public constant MAINNET_NETWORK_ID = 0;

    // Network identifier
    uint32 public networkID;

    // Leaf index --> claimed
    mapping(uint256 => bool) public claimNullifier;

    // keccak256(OriginalNetwork || tokenAddress) --> L2 token address
    mapping(bytes32 => address) public tokenInfoToAddress;

    // L2 token Address --> original token information
    mapping(address => TokenInformation) public addressToTokenInfo;

    // Global Exit Root address
    IGlobalExitRootManager public globalExitRootManager;

    // Addres of the token wrapped implementation
    address public immutable tokenImplementation;

    /**
     * @param _networkID networkID
     * @param _globalExitRootManager global exit root manager address
     */
    constructor(
        uint32 _networkID,
        IGlobalExitRootManager _globalExitRootManager
    ) {
        networkID = _networkID;
        globalExitRootManager = _globalExitRootManager;
        tokenImplementation = address(new TokenWrapped());
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
        uint32 index,
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
            "Bridge::bridge: DESTINATION_CANT_BE_ITSELF"
        );

        address originalTokenAddress;
        uint32 originNetwork;

        if (token == address(0)) {
            // Ether transfer
            require(
                msg.value == amount,
                "Bridge::bridge: AMOUNT_DOES_NOT_MATCH_MSG_VALUE"
            );

            // Ether is treated as ether from mainnet
            originNetwork = MAINNET_NETWORK_ID;
        } else {
            TokenInformation memory tokenInfo = addressToTokenInfo[token];

            if (tokenInfo.originalTokenAddress != address(0)) {
                // The token is a wrapped token from another network

                // Burn tokens
                TokenWrapped(token).burn(msg.sender, amount);

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
            originalTokenAddress,
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

        // Update the new exit root to the exit root manager
        globalExitRootManager.updateExitRoot(getDepositRoot());
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
     * @param mainnetExitRoot Mainnet exit root
     * @param rollupExitRoot Rollup exit root
     */
    function claim(
        address originalTokenAddress,
        uint256 amount,
        uint32 originalNetwork,
        uint32 destinationNetwork,
        address destinationAddress,
        bytes32[] memory smtProof,
        uint32 index,
        bytes32 mainnetExitRoot,
        bytes32 rollupExitRoot
    ) public {
        // Check nullifier
        require(
            claimNullifier[index] == false,
            "Bridge::claim: ALREADY_CLAIMED"
        );

        // Destination network must be networkID
        require(
            destinationNetwork == networkID,
            "Bridge::claim: DESTINATION_NETWORK_DOES_NOT_MATCH"
        );

        // Check that the merkle proof belongs to some global exit root
        // TODO this should be a SMTproof
        require(
            globalExitRootManager.globalExitRootMap(
                keccak256(abi.encodePacked(mainnetExitRoot, rollupExitRoot))
            ) != 0,
            "Bridge::claim: GLOBAL_EXIT_ROOT_DOES_NOT_MATCH"
        );

        if (networkID == MAINNET_NETWORK_ID) {
            // Verify merkle proof using rollup exit root
            require(
                verifyMerkleProof(
                    originalTokenAddress,
                    amount,
                    originalNetwork,
                    destinationNetwork,
                    destinationAddress,
                    smtProof,
                    index,
                    rollupExitRoot
                ),
                "Bridge::claim: SMT_INVALID"
            );
        } else {
            // Verify merkle proof using mainnet exit root
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
                "Bridge::claim: SMT_INVALID"
            );
        }

        // Update nullifier
        claimNullifier[index] = true;

        // Transfer funds
        if (originalTokenAddress == address(0)) {
            // Transfer ether
            /* solhint-disable avoid-low-level-calls */
            (bool success, ) = destinationAddress.call{value: amount}(
                new bytes(0)
            );
            require(success, "Bridge::claim: ETH_TRANSFER_FAILED");
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
                bytes32 tokenInfoHash = keccak256(
                    abi.encodePacked(originalNetwork, originalTokenAddress)
                );
                address wrappedToken = tokenInfoToAddress[tokenInfoHash];

                if (wrappedToken == address(0)) {
                    // Create a new wrapped erc20
                    TokenWrapped newWrappedToken = TokenWrapped(
                        Clones.cloneDeterministic(
                            tokenImplementation,
                            tokenInfoHash
                        )
                    );

                    newWrappedToken.initialize(
                        "name",
                        "symbol",
                        18,
                        destinationAddress,
                        amount
                    );

                    // Create mappings
                    tokenInfoToAddress[tokenInfoHash] = address(
                        newWrappedToken
                    );

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
                    TokenWrapped(wrappedToken).mint(destinationAddress, amount);
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
     * @notice Returns the precalculated address of a wrapper using the token information
     * @param originalNetwork Original network
     * @param originalTokenAddress Original token address, 0 address is reserved for ether
     */
    function precalculatedWrapperAddress(
        uint32 originalNetwork,
        address originalTokenAddress
    ) public view returns (address) {
        bytes32 salt = keccak256(
            abi.encodePacked(originalNetwork, originalTokenAddress)
        );
        return Clones.predictDeterministicAddress(tokenImplementation, salt);
    }

    /**
     * @notice Returns the address of a wrapper using the token information if already exist
     * @param originalNetwork Original network
     * @param originalTokenAddress Original token address, 0 address is reserved for ether
     */
    function getTokenWrappedAddress(
        uint32 originalNetwork,
        address originalTokenAddress
    ) public view returns (address) {
        return
            tokenInfoToAddress[
                keccak256(
                    abi.encodePacked(originalNetwork, originalTokenAddress)
                )
            ];
    }
}
