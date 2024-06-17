// hardhat import should be the first import in the file
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as hardhat from "hardhat";
import { Command } from "commander";
import { Wallet, ethers } from "ethers";
import { Deployer } from "../src.ts/deploy";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { web3Provider, GAS_MULTIPLIER } from "./utils";
import { deployedAddressesFromEnv } from "../src.ts/deploy-utils";
import { ethTestConfig } from "../src.ts/utils";

const provider = web3Provider();

async function main() {
  const program = new Command();

  program.version("0.1.0").name("deploy").description("deploy L1 contracts");

  program
    .option("--private-key <private-key>")
    .option("--chain-id <chain-id>")
    .option("--gas-price <gas-price>")
    .option("--nonce <nonce>")
    .option("--owner-address <owner-address>")
    .option("--create2-salt <create2-salt>")
    .action(async (cmd) => {
      const deployWallet = cmd.privateKey
        ? new Wallet(cmd.privateKey, provider)
        : Wallet.fromMnemonic(
            process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
            "m/44'/60'/0'/0/1"
          ).connect(provider);
      console.log(`Using deployer wallet: ${deployWallet.address}`);

      const ownerAddress = cmd.ownerAddress ? cmd.ownerAddress : deployWallet.address;
      console.log(`Using owner address: ${ownerAddress}`);

      const gasPrice = cmd.gasPrice
        ? parseUnits(cmd.gasPrice, "gwei")
        : (await provider.getGasPrice()).mul(GAS_MULTIPLIER);
      console.log(`Using gas price: ${formatUnits(gasPrice, "gwei")} gwei`);

      let nonce = cmd.nonce ? parseInt(cmd.nonce) : await deployWallet.getTransactionCount();
      console.log(`Using nonce: ${nonce}`);

      const deployer = new Deployer({
        deployWallet,
        addresses: deployedAddressesFromEnv(),
        ownerAddress,
        verbose: true,
      });

      const create2Salt = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const gasLimit = 10_000_000;
      const verifierAddress = await deployer.deployViaCreate2("TestnetVerifier", [], create2Salt, { gasPrice, nonce, gasLimit });
      nonce++;
      console.log(`VERIFIER ADDR: ${verifierAddress}`);

      const upgradeAddress = await deployer.deployViaCreate2("UpgradeVerifier", [], create2Salt, { gasPrice, nonce, gasLimit });
      nonce++;
      console.log(`UPGRADE ADDR: ${upgradeAddress}`);

      /**
      const govWallet = new Wallet("", provider); // TODO: put governor PK here
      const govDeployer = new Deployer({
        deployWallet: govWallet,
        addresses: deployedAddressesFromEnv(),
        ownerAddress: deployWallet.address,
        verbose: true,
      });
      govDeployer.addresses.Governance = ""; // TODO: put governance address here

      const stm = StateTransitionManagerFactory.connect(
        govDeployer.addresses.StateTransition.StateTransitionProxy,
        govDeployer.deployWallet
      );

      const upgradeABI = ["function upgrade(address _verifier)"];
      const upgradeInterface = new ethers.utils.Interface(upgradeABI);
      const upgradeCallData = upgradeInterface.encodeFunctionData("upgrade", [verifierAddress]);

      await govDeployer.executeUpgrade(
        govDeployer.addresses.StateTransition.StateTransitionProxy,
        0,
        stm.interface.encodeFunctionData("executeUpgrade", [
          282, // TODO: set your chain ID here
          {
            facetCuts: [],
            initAddress: upgradeAddress,
            initCalldata: upgradeCallData, // TODO: set your init calldata here(use abi-encode with your upgrade signature and arguments)
          },
        ])
      );
       **/
    });

  await program.parseAsync(process.argv);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
