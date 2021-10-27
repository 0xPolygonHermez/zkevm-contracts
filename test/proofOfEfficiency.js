const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
  createPermitSignature
} = require("./helpers/erc2612");

describe("HezMaticMerge", function () {
  const ABIbid = [
    "function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
  ];
  const iface = new ethers.utils.Interface(ABIbid);

  const swapRatio = 3500; // 3.5 factor
  const duration = 3600; // 1 hour

  const hermezTokenName = "Hermez Network Token";
  const hermezTokenSymbol = "HEZ";
  const hermezTokenInitialBalance = ethers.utils.parseEther("100000000");

  const maticTokenName = "Matic Token";
  const maticTokenSymbol = "MATIC";
  const decimals = 18;
  const maticTokenInitialBalance = ethers.utils.parseEther("20000000");

  let deployer;
  let governance;
  let userAWallet;
  let userBWallet;

  let hezMaticMergeContract;
  let hermezTokenContract;
  let maticTokenContract;

  beforeEach("Deploy contract", async () => {
    // load signers
    const signers = await ethers.getSigners();

    // assign signers
    deployer = signers[0];
    governance = signers[1];
    userAWallet = signers[2];
    userBWallet = signers[3];

    // deploy ERC20 tokens
    const hezTokenFactory = await ethers.getContractFactory("HEZ");
    const maticTokenFactory = await ethers.getContractFactory("MaticToken");

    hermezTokenContract = await hezTokenFactory.deploy(
      deployer.address
    );

    maticTokenContract = await maticTokenFactory.deploy(
      maticTokenName,
      maticTokenSymbol,
      decimals,
      maticTokenInitialBalance
    );

    await hermezTokenContract.deployed();
    await maticTokenContract.deployed();

    // deploy hezMaticMergeContract
    const HezMaticMergeFactory = await ethers.getContractFactory("HezMaticMerge");
    hezMaticMergeContract = await HezMaticMergeFactory.deploy(
      hermezTokenContract.address,
      maticTokenContract.address,
      duration
    );

    await hezMaticMergeContract.deployed();
  });

  it("should check the constructor", async () => {
    expect(await hezMaticMergeContract.hez()).to.be.equal(hermezTokenContract.address);
    expect(await hezMaticMergeContract.matic()).to.be.equal(maticTokenContract.address);
    expect(await hezMaticMergeContract.SWAP_RATIO()).to.be.equal(swapRatio);

    const deployedTimestamp = (await ethers.provider.getBlock(hezMaticMergeContract.deployTransaction.blockNumber)).timestamp;
    expect(await hezMaticMergeContract.withdrawTimeout()).to.be.equal(deployedTimestamp + duration);
  });

  it("shouldn't be able to swap HEZ for MATIC", async () => {
    // distribute tokens
    const hezMaticMergeAmount = ethers.utils.parseEther("100");
    const userWalletAmount = ethers.utils.parseEther("1");

    await maticTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, hezMaticMergeAmount);
    await hermezTokenContract.connect(deployer).transfer(userAWallet.address, userWalletAmount);
    await hermezTokenContract.connect(deployer).transfer(userBWallet.address, userWalletAmount);

    // assert token amounts
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(hezMaticMergeAmount);
    expect(await hermezTokenContract.balanceOf(userAWallet.address)).to.be.equal(userWalletAmount);
    expect(await hermezTokenContract.balanceOf(userBWallet.address)).to.be.equal(userWalletAmount);
    expect(await maticTokenContract.balanceOf(userAWallet.address)).to.be.equal(0);
    expect(await maticTokenContract.balanceOf(userBWallet.address)).to.be.equal(0);

    // try to swap 10 HEZ for 35 MATIC
    const amountToBridgeInt = 10;
    const amountToBridge = ethers.utils.parseEther(amountToBridgeInt.toString());

    const deadline = ethers.constants.MaxUint256;
    const value = amountToBridge;
    const nonce = await hermezTokenContract.nonces(userAWallet.address);
    const { v, r, s } = await createPermitSignature(
      hermezTokenContract,
      userAWallet,
      hezMaticMergeContract.address,
      value,
      nonce,
      deadline
    );

    const dataPermit = iface.encodeFunctionData("permit", [
      userAWallet.address,
      hezMaticMergeContract.address,
      value,
      deadline,
      v,
      r,
      s
    ]);

    await expect(hezMaticMergeContract.connect(userAWallet).hezToMatic(amountToBridge, dataPermit)
    ).to.be.revertedWith("MATH:SUB_UNDERFLOW");
  });

  it("should be able to swap HEZ for MATIC", async () => {
    // distribute tokens
    const hezMaticMergeAmount = ethers.utils.parseEther("100");
    const userWalletAmount = ethers.utils.parseEther("10");

    await maticTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, hezMaticMergeAmount);
    await hermezTokenContract.connect(deployer).transfer(userAWallet.address, userWalletAmount);
    await hermezTokenContract.connect(deployer).transfer(userBWallet.address, userWalletAmount);

    // assert token amounts
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(hezMaticMergeAmount);
    expect(await hermezTokenContract.balanceOf(userAWallet.address)).to.be.equal(userWalletAmount);
    expect(await hermezTokenContract.balanceOf(userBWallet.address)).to.be.equal(userWalletAmount);
    expect(await maticTokenContract.balanceOf(userAWallet.address)).to.be.equal(0);
    expect(await maticTokenContract.balanceOf(userBWallet.address)).to.be.equal(0);

    // swap 1 HEZ for 3.5 MATIC
    const amountToBridgeInt = 1;
    const amountBridgedInt = amountToBridgeInt * swapRatio / 1000;
    const amountToBridge = ethers.utils.parseEther(amountToBridgeInt.toString());
    const amountBridged = amountToBridge.mul(swapRatio).div(1000);

    const deadline = ethers.constants.MaxUint256;
    const value = amountToBridge;
    const nonce = await hermezTokenContract.nonces(userAWallet.address);
    const { v, r, s } = await createPermitSignature(
      hermezTokenContract,
      userAWallet,
      hezMaticMergeContract.address,
      value,
      nonce,
      deadline
    );

    const dataPermit = iface.encodeFunctionData("permit", [
      userAWallet.address,
      hezMaticMergeContract.address,
      value,
      deadline,
      v,
      r,
      s
    ]);

    const txSwap = await hezMaticMergeContract.connect(userAWallet).hezToMatic(amountToBridge, dataPermit);
    const receiptSwap = await txSwap.wait();

    // approve event
    const approveEvent = hermezTokenContract.interface.parseLog(receiptSwap.events[0]);
    expect(approveEvent.name).to.be.equal("Approval");
    expect(approveEvent.args.owner).to.be.equal(userAWallet.address);
    expect(approveEvent.args.spender).to.be.equal(hezMaticMergeContract.address);
    expect(approveEvent.args.value).to.be.equal(amountToBridge);

    // transferFrom event
    const transferFromEvent = hermezTokenContract.interface.parseLog(receiptSwap.events[1]);
    expect(transferFromEvent.name).to.be.equal("Transfer");
    expect(transferFromEvent.args.from).to.be.equal(userAWallet.address);
    expect(transferFromEvent.args.to).to.be.equal(hezMaticMergeContract.address);
    expect(transferFromEvent.args.value).to.be.equal(amountToBridge);

    // burn event
    const burnEvent = hermezTokenContract.interface.parseLog(receiptSwap.events[2]);
    expect(burnEvent.name).to.be.equal("Transfer");
    expect(burnEvent.args.from).to.be.equal(hezMaticMergeContract.address);
    expect(burnEvent.args.to).to.be.equal("0x0000000000000000000000000000000000000000");
    expect(burnEvent.args.value).to.be.equal(amountToBridge);

    // transfer matic token Event
    const transfermaticTokenEvent = maticTokenContract.interface.parseLog(receiptSwap.events[3]);
    expect(transfermaticTokenEvent.name).to.be.equal("Transfer");
    expect(transfermaticTokenEvent.args.from).to.be.equal(hezMaticMergeContract.address);
    expect(transfermaticTokenEvent.args.to).to.be.equal(userAWallet.address);
    expect(transfermaticTokenEvent.args.value).to.be.equal(amountBridged);

    // HezToMatic event
    const granteeEvent = receiptSwap.events[4];
    expect(granteeEvent.event).to.be.equal("HezToMatic");
    expect(granteeEvent.args.grantee).to.be.equal(userAWallet.address);
    expect(granteeEvent.args.hezAmount).to.be.equal(amountToBridge);
    expect(granteeEvent.args.maticAmount).to.be.equal(amountBridged);

    // check balances
    expect(await hermezTokenContract.balanceOf(userAWallet.address)).to.be.equal(userWalletAmount.sub(amountToBridge));
    expect(await hermezTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(0);
    expect(await maticTokenContract.balanceOf(userAWallet.address)).to.be.equal(amountBridged);
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(hezMaticMergeAmount.sub(amountBridged));
    expect(amountBridged).to.be.equal(ethers.utils.parseEther(amountBridgedInt.toString()));
  });

  it("shouldn't be able to withdrawTokens if is not the owner, or the timeout is not reached for MATIC", async () => {

    await expect(
      hezMaticMergeContract.connect(userAWallet).withdrawTokens(maticTokenContract.address, 1)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      hezMaticMergeContract.connect(userAWallet).withdrawTokens("0x0000000000000000000000000000000000000000", 1)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens(maticTokenContract.address, 1)
    ).to.be.revertedWith("HezMaticMerge::withdrawTokens: TIMEOUT_NOT_REACHED");

    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens("0x0000000000000000000000000000000000000000", 1)
    ).to.be.revertedWith("Address: call to non-contract");
  });

  it("should be able to withdrawTokens ", async () => {
    // send tokens to HezMaticMerge contract
    await maticTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, maticTokenInitialBalance);
    await hermezTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, hermezTokenInitialBalance);

    // assert balances HezMaticMerge
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(maticTokenInitialBalance);
    expect(await hermezTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(hermezTokenInitialBalance);

    // assert balances deployer
    expect(await hermezTokenContract.balanceOf(deployer.address)).to.be.equal(0);
    expect(await maticTokenContract.balanceOf(deployer.address)).to.be.equal(0);

    // assert withdraw of MATIC can't be done until timeout is reached
    const withdrawTimeout = (await hezMaticMergeContract.withdrawTimeout()).toNumber();
    let currentTimestamp = (await ethers.provider.getBlock()).timestamp;

    expect(withdrawTimeout).to.be.greaterThan(currentTimestamp);

    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens(maticTokenContract.address, maticTokenInitialBalance)
    ).to.be.revertedWith("HezMaticMerge::withdrawTokens: TIMEOUT_NOT_REACHED");

    // withdraw HEZ tokens without timeout restrictions

    // assert only owner can withdraw the tokens
    await expect(
      hezMaticMergeContract.connect(governance).withdrawTokens(hermezTokenContract.address, hermezTokenInitialBalance)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(hezMaticMergeContract.connect(deployer).withdrawTokens(hermezTokenContract.address, hermezTokenInitialBalance)
    ).to.emit(hezMaticMergeContract, "WithdrawTokens")
      .withArgs(hermezTokenContract.address, hermezTokenInitialBalance);

    // assert balances HezMaticMerge
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(maticTokenInitialBalance);
    expect(await hermezTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(0);

    // assert balances deployer
    expect(await hermezTokenContract.balanceOf(deployer.address)).to.be.equal(hermezTokenInitialBalance);
    expect(await maticTokenContract.balanceOf(deployer.address)).to.be.equal(0);

    // assert no more tokens can be withdrawed if there's no balance
    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens(hermezTokenContract.address, 1)
    ).to.be.revertedWith("MATH:SUB_UNDERFLOW");

    // advance time and withdraw MATIC
    currentTimestamp = (await ethers.provider.getBlock()).timestamp;
    await ethers.provider.send("evm_increaseTime", [withdrawTimeout - currentTimestamp + 1]);
    await ethers.provider.send("evm_mine");

    currentTimestamp = (await ethers.provider.getBlock()).timestamp;
    expect(withdrawTimeout).to.be.lessThan(currentTimestamp);

    await expect(hezMaticMergeContract.connect(deployer).withdrawTokens(maticTokenContract.address, maticTokenInitialBalance)
    ).to.emit(hezMaticMergeContract, "WithdrawTokens")
      .withArgs(maticTokenContract.address, maticTokenInitialBalance);

    // assert balances HezMaticMerge
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(0);
    expect(await hermezTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(0);

    // assert balances deployer
    expect(await hermezTokenContract.balanceOf(deployer.address)).to.be.equal(hermezTokenInitialBalance);
    expect(await maticTokenContract.balanceOf(deployer.address)).to.be.equal(maticTokenInitialBalance);
  });

  it("should be able to update withdrawLeftOver ", async () => {
    // send tokens to HezMaticMerge contract
    await maticTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, maticTokenInitialBalance);

    // assert balances
    expect(await maticTokenContract.balanceOf(hezMaticMergeContract.address)).to.be.equal(maticTokenInitialBalance);
    expect(await maticTokenContract.balanceOf(deployer.address)).to.be.equal(0);

    // assert withdraw can't be done until timeout is reached
    const withdrawTimeout = (await hezMaticMergeContract.withdrawTimeout()).toNumber();
    let currentTimestamp = (await ethers.provider.getBlock()).timestamp;

    expect(withdrawTimeout).to.be.greaterThan(currentTimestamp);

    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens(maticTokenContract.address, maticTokenInitialBalance)
    ).to.be.revertedWith("HezMaticMerge::withdrawTokens: TIMEOUT_NOT_REACHED");

    // advance time and withdraw leftovers
    await ethers.provider.send("evm_increaseTime", [withdrawTimeout - currentTimestamp + 1]);
    await ethers.provider.send("evm_mine");

    currentTimestamp = (await ethers.provider.getBlock()).timestamp;
    expect(withdrawTimeout).to.be.lessThan(currentTimestamp);

    await expect(
      hezMaticMergeContract.connect(governance).setWithdrawTimeout(withdrawTimeout)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      hezMaticMergeContract.connect(deployer).setWithdrawTimeout(withdrawTimeout)
    ).to.be.revertedWith("HezMaticMerge::setWithdrawTimeout: NEW_TIMEOUT_MUST_BE_HIGHER");

    await expect(
      hezMaticMergeContract.connect(deployer).setWithdrawTimeout(currentTimestamp)
    ).to.emit(hezMaticMergeContract, "NewWithdrawTimeout")
      .withArgs(currentTimestamp);

    await expect(
      hezMaticMergeContract.connect(deployer).setWithdrawTimeout(currentTimestamp + 3000)
    ).to.emit(hezMaticMergeContract, "NewWithdrawTimeout")
      .withArgs(currentTimestamp + 3000);

    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens(maticTokenContract.address, maticTokenInitialBalance)
    ).to.be.revertedWith("HezMaticMerge::withdrawTokens: TIMEOUT_NOT_REACHED");
  });

  it("should be able to transfer ownership", async () => {
    // send tokens to HezMaticMerge contract
    await maticTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, maticTokenInitialBalance);
    await hermezTokenContract.connect(deployer).transfer(hezMaticMergeContract.address, hermezTokenInitialBalance);

    // check current owner
    expect(await hezMaticMergeContract.owner()).to.be.equal(deployer.address);

    // transfer ownership
    await expect(
      hezMaticMergeContract.connect(governance).transferOwnership(governance.address)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(hezMaticMergeContract.connect(deployer).transferOwnership(governance.address)
    ).to.emit(hezMaticMergeContract, "OwnershipTransferred")
      .withArgs(deployer.address, governance.address);

    // check new owner premissions
    expect(await hezMaticMergeContract.owner()).to.be.equal(governance.address);

    await expect(
      hezMaticMergeContract.connect(deployer).withdrawTokens(hermezTokenContract.address, 0)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      hezMaticMergeContract.connect(governance).withdrawTokens(hermezTokenContract.address, hermezTokenInitialBalance)
    ).to.emit(hezMaticMergeContract, "WithdrawTokens")
      .withArgs(hermezTokenContract.address, hermezTokenInitialBalance);
  });
});