const { ethers } = require("hardhat");

async function main() {
    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";  // 배포된 컨트랙트 주소
    const MyContract = await ethers.getContractAt("MyContract", contractAddress);

    // 상태 변경 함수 호출 (트랜잭션 필요)
    const signer = await ethers.provider.getSigner();
    await MyContract.connect(signer).setNumber(300);
    console.log("Updated number:", await MyContract.number());
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});