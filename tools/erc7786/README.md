# Deploy ERC-7786 Gateway (AgglayerERC7786Gateway)

Script to deploy `AgglayerERC7786Gateway.sol`, the [ERC-7786](https://eips.ethereum.org/EIPS/eip-7786) gateway adapter on top of the AgglayerBridge message-passing layer.

## L1 vs L2

The **same contract** is deployed on every network that wants to exchange ERC-7786 messages: L1 (Ethereum) and each L2/aggchain. There is no code difference between the L1 and L2 deployments, only the configuration differs:

- **Constructor**: the address of the AgglayerBridge deployed on that network (the gateway reads its local Agglayer `networkID` from the bridge) and the owner.
- **Post-deployment registration**: on each network, the owner must register every remote network it wants to talk to via `registerRemoteNetwork(chainId, networkID, gateway)`, where `gateway` is the counterpart `AgglayerERC7786Gateway` deployed on that remote network.

For example, to connect L1 (networkID 0) with an L2 (networkID 1, chainId 1101):

1. Deploy the gateway on L1 (pointing to the L1 bridge).
2. Deploy the gateway on the L2 (pointing to the L2 bridge).
3. On the L1 gateway, register the L2: `registerRemoteNetwork(1101, 1, <L2 gateway address>)`.
4. On the L2 gateway, register L1: `registerRemoteNetwork(1, 0, <L1 gateway address>)`.

Since the counterpart gateway address must be known to register it, either deploy on both networks first and then register (the script supports leaving `remoteNetworks` empty and registering later), or use deterministic deployment addresses.

## Setup

- Config file `deploy_erc7786_gateway.json`:
  - `bridgeAddress`: AgglayerBridge address on the network being deployed to (mandatory)
  - `owner`: gateway owner, allowed to register remote networks. If empty, defaults to the deployer
  - `remoteNetworks`: optional array of remote networks to register right after deployment (only executed if the deployer is the owner). Each entry:
    - `chainId`: EIP-155 chain id of the remote network
    - `networkID`: Agglayer network id of the remote network
    - `gateway`: counterpart `AgglayerERC7786Gateway` address on that network
  - `deployerPvtKey`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
- A network should be selected when running the script
  - examples: `--network sepolia` (L1) or `--network polygonZKEVMTestnet` (L2)
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`

## Usage

- Copy configuration file:
```
cp ./tools/erc7786/deploy_erc7786_gateway.json.example ./tools/erc7786/deploy_erc7786_gateway.json
```

- Set your parameters
- Run tool (once per network, L1 and/or L2):
```
npx hardhat run ./tools/erc7786/deployErc7786Gateway.ts --network <network>
```

- Output: `deploy_erc7786_gateway_output.json`:
```
{
 "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
 "owner": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
 "bridgeAddress": "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe",
 "localNetworkID": "0",
 "erc7786GatewayContract": "0x851356ae760d987E095750cCeb3bC6014560891C",
 "registeredRemoteNetworks": [
  {
   "chainId": 1101,
   "networkID": 1,
   "gateway": "0xc5a5C42992dECbae36851359345FE25997F5C42d"
  }
 ]
}
```
