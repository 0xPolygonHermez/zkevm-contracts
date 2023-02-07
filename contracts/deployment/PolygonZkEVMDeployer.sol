// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * Contract responsible for deploying deterministic address contracts related with the PolygonZkEVM
 */
contract PolygonZkEVMDeployer is Ownable {
    /**
     * @param _owner Owner
     */
    constructor(address _owner) Ownable() {
        _transferOwnership(_owner);
    }

    /**
     * @dev Emitted when a contract is deployed
     */
    event NewDeployment(address newContractAddress);

    /**
     * @dev Emitted when a contract is called
     */
    event Call();

    /**
     * @param amount Amount of contract deploy
     * @param salt salt used in create2
     * @param initBytecode init bytecode that will be use din create2
     */
    function deploy(
        uint256 amount,
        bytes32 salt,
        bytes memory initBytecode
    ) public onlyOwner {
        address newContractAddress = Create2.deploy(amount, salt, initBytecode);

        emit NewDeployment(newContractAddress);
    }

    /**
     * @param amount Amount of contract deploy
     * @param salt salt used in create2
     * @param initBytecode init bytecode that will be use din create2
     * @param dataCall data used in the call after deploying the smart contract
     */
    function deployAndCall(
        uint256 amount,
        bytes32 salt,
        bytes memory initBytecode,
        bytes memory dataCall
    ) public onlyOwner {
        address newContractAddress = Create2.deploy(amount, salt, initBytecode);
        Address.functionCall(newContractAddress, dataCall);

        emit NewDeployment(newContractAddress);
    }

    /**
     * @param targetAddress Amount of contract deploy
     * @param dataCall Data used to call the target smart contract
     */
    function call(
        address targetAddress,
        bytes memory dataCall
    ) public onlyOwner {
        Address.functionCall(targetAddress, dataCall);

        emit Call();
    }
}
