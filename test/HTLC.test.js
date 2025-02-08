const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChainHTLC", function () {
  let htlc;
  let token;
  let owner;
  let participant;
  const hashlock = ethers.keccak256(ethers.encodeBytes32String("secret"));
  const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

  beforeEach(async function () {
    [owner, participant] = await ethers.getSigners();

    // Deploy a mock ERC20 token
    const Token = await ethers.getContractFactory("MockERC20");
    token = await Token.deploy("Test Token", "TT", 18, ethers.parseEther("1000"));
    await token.waitForDeployment();

    // Deploy the HTLC contract
    const HTLC = await ethers.getContractFactory("CrossChainHTLC");
    htlc = await HTLC.deploy();
    await htlc.waitForDeployment();
    console.log("HTLC deployed to:", htlc);
  });

  it("should lock tokens", async function () {
    const amount = ethers.parseEther("10");

    // Approve and lock tokens
    await token.approve(await htlc.getAddress(), amount);
    const tx = await htlc.lockTokens(
      await participant.getAddress(),
      [{ token: await token.getAddress(), amount }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error("No receipt");
    const swapId = receipt.logs[0].topics[1];
    console.log(receipt);
    console.log(receipt.logs);
    console.log(receipt.logs[0]);
    console.log(receipt.logs[0].topics);
    console.log(receipt.logs[0].topics[1]);
    console.log(swapId);
    // Check the swap details
    const swap = await htlc.swaps(swapId);
    console.log(swap)
    expect(swap.initiator).to.equal(await owner.getAddress());
    expect(swap.participant).to.equal(await participant.getAddress());
    expect(swap.hashlock).to.equal(hashlock);
    expect(swap.timelock).to.equal(BigInt(timelock));
  });

  it("should redeem tokens with correct secret", async function () {
    const amount = ethers.parseEther("10");

    // Approve and lock tokens
    await token.approve(await htlc.getAddress(), amount);
    const tx = await htlc.lockTokens(
      await participant.getAddress(),
      [{ token: await token.getAddress(), amount }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error("No receipt");
    const swapId = receipt.logs[0].topics[1];

    // Redeem tokens
    await htlc.connect(participant).redeemTokens(swapId, ethers.encodeBytes32String("secret"));

    // Check balances
    expect(await token.balanceOf(participant.address)).to.equal(amount);
  });

  it("should refund tokens after timelock", async function () {
    const amount = ethers.parseEther("10");

    // Approve and lock tokens
    await token.approve(await htlc.getAddress(), amount);
    const tx = await htlc.lockTokens(
      await participant.getAddress(),
      [{ token: await token.getAddress(), amount }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error("No receipt");
    const swapId = receipt.logs[0].topics[1];

    // Increase time to after timelock
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine");

    // Refund tokens
    await htlc.refundTokens(swapId);

    // Check balances
    expect(await token.balanceOf(owner.address)).to.equal(amount);
  });
});
