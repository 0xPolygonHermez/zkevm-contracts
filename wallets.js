const ethers = require("ethers");

async function main() {
  const arrayNames = [
    "## Deployment Address",
    "\\n\\n## Trusted sequencer",
    "\\n\\n## Trusted aggregator",
  ];
  for (let i = 0; i < arrayNames.length; i++) {
    const wallet = ethers.Wallet.createRandom();
    console.log(arrayNames[i]);
    console.log(`Address: ${wallet.address}`);
    console.log(`PrvKey: ${wallet._signingKey().privateKey}`);
    console.log(`mnemonic: "${wallet._mnemonic().phrase}"`);

    const keystoreJson = await wallet.encrypt("password");
    console.log(`keystore: ${keystoreJson}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});