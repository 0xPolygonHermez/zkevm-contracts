
const ethers = require("ethers");
const DEFAULT_NUM_ACCOUNTS = 20;
require("dotenv").config();
const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

async function main() {
  {
    const MNEMONIC = process.env.MNEMONIC || DEFAULT_MNEMONIC;
    const currentProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    const signerNode = await currentProvider.getSigner();
    const numAccountsToFund = DEFAULT_NUM_ACCOUNTS;

    for (let i = 0; i < numAccountsToFund; i++) {
      const pathWallet = `m/44'/60'/0'/0/${i}`;
      let accountWallet = ethers.Wallet.fromMnemonic(MNEMONIC, pathWallet);
      const params = [{
        from: await signerNode.getAddress(),
        to: accountWallet.address,
        value: "0x3635C9ADC5DEA00000",
      }];
      const tx = await currentProvider.send("eth_sendTransaction", params);
      if (i == numAccountsToFund - 1) {
        await currentProvider.waitForTransaction(tx);
      }
    }
  }
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
