import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  networks: {
    sepolia: {
      url: 'https://sepolia.infura.io/v3/338789f6e51a4538af6afa17d5b6be52',
      accounts: ['0x92d6ace45e169339aa5b1989bfd5aefcc44cc652e2087df9484c8b63d8aa2510'],
    },
  },
};

export default config;
