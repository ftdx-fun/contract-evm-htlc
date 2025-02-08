const { ethers } = require("hardhat");

async function main() {
    ethers.getSigner
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    // Deploy the ERC20 token
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Test Token", "TTT", 18, ethers.parseEther("1000"));
    await token.deployed();
    console.log("ERC20 Token deployed to:", token.address);

    // Deploy the HTLC contract
    // const HTLC = await ethers.getContractFactory("CrossChainHTLC");
    // const htlc = await HTLC.deploy();
    // await htlc.deployed();
    // console.log("HTLC contract deployed to:", htlc.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
