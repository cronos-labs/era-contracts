import { expect } from "chai";
import { ethers, Wallet } from "ethers";
import * as hardhat from "hardhat";
import { hashL2Bytecode } from "../../scripts/utils";
import type { L1WethBridge, WETH9 } from "../../typechain";
import { L1WethBridgeFactory, WETH9Factory } from "../../typechain";

import type { IBridgehubMailbox } from "../../typechain/IBridgehubMailbox";
import { getCallRevertReason, initialDeployment, CONTRACTS_LATEST_PROTOCOL_VERSION } from "./utils";
import {
  calculateWethAddresses,
  L2_WETH_BRIDGE_IMPLEMENTATION_BYTECODE,
  L2_WETH_BRIDGE_PROXY_BYTECODE,
} from "../../scripts/utils-bytecode";

import * as fs from "fs";
import { EraLegacyChainId } from "../../src.ts/deploy";

import { Interface } from "ethers/lib/utils";
import type { Address } from "zksync-web3/build/src/types";

const testConfigPath = "./test/test_config/constant";
const ethTestConfig = JSON.parse(fs.readFileSync(`${testConfigPath}/eth.json`, { encoding: "utf-8" }));

const DEPLOYER_SYSTEM_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000008006";
const REQUIRED_L2_GAS_PRICE_PER_PUBDATA = require("../../../SystemConfig.json").REQUIRED_L2_GAS_PRICE_PER_PUBDATA;

process.env.CONTRACTS_LATEST_PROTOCOL_VERSION = CONTRACTS_LATEST_PROTOCOL_VERSION;

export async function create2DeployFromL1(
  bridgehub: IBridgehubMailbox,
  chainId: ethers.BigNumberish,
  walletAddress: Address,
  bytecode: ethers.BytesLike,
  constructor: ethers.BytesLike,
  create2Salt: ethers.BytesLike,
  l2GasLimit: ethers.BigNumberish
) {
  const deployerSystemContracts = new Interface(hardhat.artifacts.readArtifactSync("IContractDeployer").abi);
  const bytecodeHash = hashL2Bytecode(bytecode);
  const calldata = deployerSystemContracts.encodeFunctionData("create2", [create2Salt, bytecodeHash, constructor]);
  const gasPrice = await bridgehub.provider.getGasPrice();
  const expectedCost = await bridgehub.l2TransactionBaseCost(
    chainId,
    gasPrice,
    l2GasLimit,
    REQUIRED_L2_GAS_PRICE_PER_PUBDATA
  );

  await bridgehub.requestL2Transaction(
    chainId,
    DEPLOYER_SYSTEM_CONTRACT_ADDRESS,
    0,
    calldata,
    l2GasLimit,
    REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
    [bytecode],
    walletAddress,
    { value: expectedCost, gasPrice }
  );
}

describe("WETH Bridge tests", () => {
  let owner: ethers.Signer;
  let randomSigner: ethers.Signer;
  let bridgeProxy: L1WethBridge;
  let l1Weth: WETH9;
  const functionSignature = "0x0fdef251";
  let chainId = process.env.CHAIN_ETH_ZKSYNC_NETWORK_ID || 270;

  before(async () => {
    [owner, randomSigner] = await hardhat.ethers.getSigners();

    const deployWallet = Wallet.fromMnemonic(ethTestConfig.test_mnemonic4, "m/44'/60'/0'/0/1").connect(owner.provider);
    const ownerAddress = await deployWallet.getAddress();

    const gasPrice = await owner.provider.getGasPrice();

    const tx = {
      from: owner.getAddress(),
      to: deployWallet.address,
      value: ethers.utils.parseEther("1000"),
      nonce: owner.getTransactionCount(),
      gasLimit: 100000,
      gasPrice: gasPrice,
    };

    await owner.sendTransaction(tx);

    // note we can use initialDeployment so we don't go into deployment details here
    const deployer = await initialDeployment(deployWallet, ownerAddress, gasPrice, []);

    chainId = deployer.chainId;

    l1Weth = WETH9Factory.connect((await (await hardhat.ethers.getContractFactory("WETH9")).deploy()).address, owner);
    // prepare the bridge

    const bridge = await (
      await hardhat.ethers.getContractFactory("L1WethBridge")
    ).deploy(
      l1Weth.address,
      deployer.addresses.Bridgehub.BridgehubProxy,
      EraLegacyChainId
    );

    const _bridgeProxy = await (await hardhat.ethers.getContractFactory("ERC1967Proxy")).deploy(bridge.address, "0x");

    bridgeProxy = L1WethBridgeFactory.connect(_bridgeProxy.address, _bridgeProxy.signer);

    const { l2WethProxyAddress, l2WethBridgeProxyAddress } = calculateWethAddresses(
      await owner.getAddress(),
      bridgeProxy.address,
      l1Weth.address
    );

    await bridgeProxy.initialize();

    await bridgeProxy.initializeV2(
      [L2_WETH_BRIDGE_IMPLEMENTATION_BYTECODE, L2_WETH_BRIDGE_PROXY_BYTECODE],
      l2WethProxyAddress,
      l2WethBridgeProxyAddress,
      await owner.getAddress(),
      await owner.getAddress()
    );

    await bridgeProxy.initializeChainGovernance(chainId, l2WethProxyAddress, l2WethBridgeProxyAddress);
  });

  it("Should not allow depositing zero WETH", async () => {
    const revertReason = await getCallRevertReason(
      bridgeProxy
        .connect(randomSigner)
        .deposit(
          chainId,
          await randomSigner.getAddress(),
          await bridgeProxy.l1WethAddress(),
          0,
          0,
          0,
          ethers.constants.AddressZero
        )
    );

    expect(revertReason).equal("Amount cannot be zero");
  });

  it("Should deposit successfully", async () => {
    await l1Weth.connect(randomSigner).deposit({ value: 100 });
    await (await l1Weth.connect(randomSigner).approve(bridgeProxy.address, 100)).wait();
    await bridgeProxy
      .connect(randomSigner)
      .deposit(
        chainId,
        await randomSigner.getAddress(),
        l1Weth.address,
        100,
        1000000,
        REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
        await randomSigner.getAddress(),
        { value: ethers.constants.WeiPerEther }
      );
  });

  it("Should revert on finalizing a withdrawal with wrong message length", async () => {
    const revertReason = await getCallRevertReason(
      bridgeProxy.connect(randomSigner).finalizeWithdrawal(chainId, 0, 0, 0, "0x", [])
    );
    expect(revertReason).equal("pm");
  });

  it("Should revert on finalizing a withdrawal with wrong function selector", async () => {
    const revertReason = await getCallRevertReason(
      bridgeProxy.connect(randomSigner).finalizeWithdrawal(chainId, 0, 0, 0, ethers.utils.randomBytes(96), [])
    );
    expect(revertReason).equal("is");
  });

  it("Should revert on finalizing a withdrawal with wrong receiver", async () => {
    const revertReason = await getCallRevertReason(
      bridgeProxy
        .connect(randomSigner)
        .finalizeWithdrawal(
          chainId,
          0,
          0,
          0,
          ethers.utils.hexConcat([functionSignature, ethers.utils.randomBytes(92)]),
          [ethers.constants.HashZero]
        )
    );
    expect(revertReason).equal("pi");
  });

  it("Should revert on finalizing a withdrawal with wrong L2 sender", async () => {
    const revertReason = await getCallRevertReason(
      bridgeProxy
        .connect(randomSigner)
        .finalizeWithdrawal(
          chainId,
          0,
          0,
          0,
          ethers.utils.hexConcat([
            functionSignature,
            bridgeProxy.address,
            ethers.utils.randomBytes(32),
            ethers.utils.randomBytes(40),
          ]),
          [ethers.constants.HashZero]
        )
    );
    expect(revertReason).equal("pi");
  });
});
