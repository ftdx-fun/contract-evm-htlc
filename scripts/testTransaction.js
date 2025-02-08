const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://sepolia.infura.io/v3/338789f6e51a4538af6afa17d5b6be52");
const wallet = new ethers.Wallet("0x92d6ace45e169339aa5b1989bfd5aefcc44cc652e2087df9484c8b63d8aa2510", provider);
const wallet2 = new ethers.Wallet("0x92d6ace45e169339aa5b1989bfd5aefcc44cc652e2087df9484c8b63d8aa2510", provider);



const contractAddress = "0xb3c34AD9996fDBCC5c452222E57bBb20939544d7";
const CrossChainHTLC = require("../artifacts/contracts/HTLC.sol/CrossChainHTLC.json");
const htlcContract = new ethers.Contract(contractAddress, CrossChainHTLC.abi, wallet);

const tokenAddress = "0x3449b6686c56d278BE08dffEE0bE8095A01D2e9F";
const tokenAbi = require("../artifacts/contracts/MockERC20.sol/MockERC20.json");
const tokenContract = new ethers.Contract(tokenAddress, tokenAbi.abi, wallet);


const tokenAddress2 = "0x86b21B4A1d206F994F239E0C90F1288BD0338986";
const tokenContract2 = new ethers.Contract(tokenAddress2, tokenAbi.abi, wallet2);


async function lockTokens(participant, tokens, hashlock, timelock) {
    try {
      const tx = await htlcContract.lockTokens(participant, tokens, hashlock, timelock);
  
      const receipt = await tx.wait();
      console.log("Transaction confirmed in block:", receipt.blockNumber);
      
      const swapId = receipt.logs[1].topics[1];
      console.log("Swap ID:", swapId);
    } catch (error) {
      console.error("Error locking tokens:", error);
    }
}

async function setAllowance() {
    try {
        const amountToApprove = ethers.parseEther("10"); // 예시로 10 토큰
        const tx = await tokenContract.approve(contractAddress, amountToApprove);
        await tx.wait();
        console.log("Allowance set successfully");
    } catch (error) {
        console.error("Error setting allowance:", error);
    }
}

async function refundTokens() {
    try {
      const swapId = "0x561c6f1a39fd7aef552a071d27ad1390418e3347288134eb8f56ae1a6fe8524a";
      const tx = await htlcContract.refundTokens(swapId);
      console.log("Transaction hash:", tx.hash);
      await tx.wait();
      console.log("Tokens refunded successfully");
    } catch (error) {
      console.error("Error refunding tokens:", error);
    }
}
 
  

async function main() {
    await setAllowance();

    const hashlock = ethers.keccak256(ethers.toUtf8Bytes("secret"));
    const timelock = Math.floor(Date.now() / 1000) + 3600 * 10; // 1 hour from now
    const participant = "0xD77148D7ef455DAc944e20cA78b5e71f54eefa34";
    const tokens = [
        { token: tokenAddress, amount: ethers.parseEther("10") }
    ];
    await lockTokens(participant, tokens, hashlock, timelock);
    
    // await refundTokens();


}

main();