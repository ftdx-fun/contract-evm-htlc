// test/cross_chain_htlc.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

let CrossChainHTLC: any;
let htlc: any;
let Token: any;
let erc20a: any;
let erc20b: any;

let deployer: any;
let admin: any;
let initiator: any;
let participant: any;
let nonAdmin: any;

const iface = new ethers.Interface([
  "event NewSwap(bytes32 swapId, address initiator, address participant, bytes32 hashlock, uint256 timelock, uint256 timestamp, (address token, uint256 amount, bool isNative)[] tokens)"
]);

function extractSwapId(receipt: any) {
  const NEW_SWAP_TOPIC = ethers.id(
    "NewSwap(bytes32,address,address,bytes32,uint256,uint256,(address,uint256,bool)[])"
  );

  for (const log of receipt.logs) {
    if (log.topics[0] === NEW_SWAP_TOPIC) {
      return log.topics[1];
    }
  }
  throw new Error("NewSwap event not found");
}

function generateSecret(secretString: string) {
  const secret = ethers.keccak256(ethers.toUtf8Bytes(secretString));
  return secret;
}

describe("CrossChainHTLC", function () {
  before(async () => {
    [deployer, admin, initiator, participant, nonAdmin] = await ethers.getSigners();

    Token = await ethers.getContractFactory("MockERC20");
    erc20a = await Token.connect(deployer).deploy("TokenA", "TKA", 18, ethers.parseEther("100000000"));
    await erc20a.waitForDeployment();
  
    erc20b = await Token.connect(deployer).deploy("TokenB", "TKB", 18, ethers.parseEther("100000000"));
    await erc20b.waitForDeployment();
  
    CrossChainHTLC = await ethers.getContractFactory("CrossChainHTLC");
    htlc = await CrossChainHTLC.connect(deployer).deploy();
    await htlc.waitForDeployment();
    
    await erc20a.connect(deployer).transfer(initiator.address, ethers.parseEther("1000"));
    await erc20b.connect(deployer).transfer(initiator.address, ethers.parseEther("1000"));
  });


  it("Locks and redeems only native ETH", async () => {
    const secretString = "only eth";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [
        { token: ethers.ZeroAddress, amount: ethers.parseEther("1").toString(), isNative: true }
      ],
      hashlock,
      timelock,
      { value: ethers.parseEther("1") }
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    const balanceBefore = await ethers.provider.getBalance(participant.address);

    await htlc.connect(participant).redeemTokens(swapId, secret);

    const balanceAfter = await ethers.provider.getBalance(participant.address);
    expect(balanceAfter).to.be.gt(balanceBefore);
  });

  it("Locks and redeems only ERC20 tokens", async () => {
    const secretString = "only tokens";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    await erc20a.connect(initiator).approve(htlc.getAddress(), ethers.parseEther("1"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [
        { token: erc20a.getAddress(), amount: ethers.parseEther("1").toString(), isNative: false },
      ],
      hashlock,
      timelock,
      { value: 0 }
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await htlc.connect(participant).redeemTokens(swapId, secret);

    const balance = await erc20a.balanceOf(participant.address);
    expect(balance).to.be.equal(ethers.parseEther("1"));
  });

  it("Locks and redeems both ETH and ERC20", async () => {
    const secretString = "both eth and tokens";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    await erc20b.connect(initiator).approve(await htlc.getAddress(), ethers.parseEther("2"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [
        { token: ethers.ZeroAddress, amount: ethers.parseEther("1"), isNative: true },
        { token: erc20b.getAddress(), amount: ethers.parseEther("2"), isNative: false },
      ],
      hashlock,
      timelock,
      { value: ethers.parseEther("1") }
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await htlc.connect(participant).redeemTokens(swapId, secret);

    const tokenBalance = await erc20b.balanceOf(participant.address);
    expect(tokenBalance).to.equal(ethers.parseEther("2"));
  });

  it("Refunds tokens after timelock", async () => {
    const secretString = "refund after timeout";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 100;

    await erc20a.connect(initiator).approve(await htlc.getAddress(), ethers.parseEther("1"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [{ token: erc20a.getAddress(), amount: ethers.parseEther("1"), isNative: false }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    await htlc.connect(initiator).refundTokens(swapId);

    const balance = await erc20a.balanceOf(initiator.address);
    expect(balance).to.be.gt(0);
  });

  it("Fails to redeem with wrong secret", async () => {
    const secretString = "correct secret";
    const wrongSecretString = "wrong secret";
    const secret = generateSecret(secretString);
    const wrongSecret = generateSecret(wrongSecretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    await erc20b.connect(initiator).approve(htlc.getAddress(), ethers.parseEther("1"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [{ token: erc20b.getAddress(), amount: ethers.parseEther("1"), isNative: false }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await expect(htlc.connect(participant).redeemTokens(swapId, wrongSecret)).to.be.revertedWith("Invalid secret");
  });

  it("Fails to expire timelock with non-admin", async () => {
    const secretString = "nonadmin expire";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    await erc20a.connect(initiator).approve(htlc.getAddress(), ethers.parseEther("1"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [{ token: erc20a.getAddress(), amount: ethers.parseEther("1"), isNative: false }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await expect(htlc.connect(nonAdmin).expireTimelock(swapId)).to.be.revertedWith("Not admin");
  });

  it("Fails to redeem after already withdrawn", async () => {
    const secretString = "redeem twice";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    await erc20b.connect(initiator).approve(htlc.getAddress(), ethers.parseEther("1"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [{ token: erc20b.getAddress(), amount: ethers.parseEther("1"), isNative: false }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await htlc.connect(participant).redeemTokens(swapId, secret);

    await expect(htlc.connect(participant).redeemTokens(swapId, secret)).to.be.revertedWith("Already withdrawn");
  });

  it("Fails to refund after already refunded", async () => {
    const secretString = "refund twice";
    const secret = generateSecret(secretString);
    const hashlock = ethers.keccak256(secret);
    const timelock = (await ethers.provider.getBlock("latest"))!.timestamp + 100;

    await erc20a.connect(initiator).approve(htlc.getAddress(), ethers.parseEther("1"));

    const tx = await htlc.connect(initiator).lockTokens(
      participant.address,
      [{ token: erc20a.getAddress(), amount: ethers.parseEther("1"), isNative: false }],
      hashlock,
      timelock
    );
    const receipt = await tx.wait();
    const swapId = await extractSwapId(receipt);

    await ethers.provider.send("evm_increaseTime", [300]);
    await ethers.provider.send("evm_mine", []);

    await htlc.connect(initiator).refundTokens(swapId);

    await expect(htlc.connect(initiator).refundTokens(swapId)).to.be.revertedWith("Already refunded");
  });
});
