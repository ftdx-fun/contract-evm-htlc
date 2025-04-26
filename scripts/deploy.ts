import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);


      // Deploy the ERC20 token
    // const Token = await ethers.getContractFactory("MockERC20");
    // const token = await Token.deploy("FTE", "FTE", 18, ethers.parseEther("100000000000"));
    // await token.waitForDeployment();
    // console.log("ERC20 Token deployed to:", token.getAddress());


  console.log("Deploying CrossChainHTLC contract...");
  const CrossChainHTLC = await ethers.getContractFactory("CrossChainHTLC");
  const htlc = await CrossChainHTLC.deploy();

  // deployed() 대신 waitForDeployment() 사용
  await htlc.waitForDeployment();
  
  const address = await htlc.getAddress();  // getAddress() 사용
  console.log(`CrossChainHTLC deployed to: ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 