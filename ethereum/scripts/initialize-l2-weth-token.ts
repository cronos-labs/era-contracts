import { Command } from 'commander';
import { ethers, Wallet } from 'ethers';
import { Deployer } from '../src.ts/deploy';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import { web3Provider, getNumberFromEnv, REQUIRED_L2_GAS_PRICE_PER_PUBDATA } from './utils';
import { getTokens } from 'reading-tool';

import * as fs from 'fs';
import * as path from 'path';

const provider = web3Provider();
const testConfigPath = path.join(process.env.ZKSYNC_HOME as string, `etc/test_config/constant`);
const ethTestConfig = JSON.parse(fs.readFileSync(`${testConfigPath}/eth.json`, { encoding: 'utf-8' }));

const contractArtifactsPath = path.join(process.env.ZKSYNC_HOME as string, 'contracts/zksync/artifacts-zk/');
const l2BridgeArtifactsPath = path.join(contractArtifactsPath, 'cache-zk/solpp-generated-contracts/bridge/');
const openzeppelinTransparentProxyArtifactsPath = path.join(
    contractArtifactsPath,
    '@openzeppelin/contracts/proxy/transparent/'
);

function readInterface(path: string, fileName: string) {
    const abi = JSON.parse(fs.readFileSync(`${path}/${fileName}.sol/${fileName}.json`, { encoding: 'utf-8' })).abi;
    return new ethers.utils.Interface(abi);
}

const DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT = getNumberFromEnv('CONTRACTS_DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT');
const L2_WETH_INTERFACE = readInterface(l2BridgeArtifactsPath, 'L2Weth');
const TRANSPARENT_UPGRADEABLE_PROXY = readInterface(
    openzeppelinTransparentProxyArtifactsPath,
    'TransparentUpgradeableProxy'
);

function getL2Calldata(l2WethBridgeAddress: string, l1WethTokenAddress: string, l2WethTokenImplAddress: string) {
    const upgradeData = L2_WETH_INTERFACE.encodeFunctionData('initializeV2', [l2WethBridgeAddress, l1WethTokenAddress]);
    return TRANSPARENT_UPGRADEABLE_PROXY.encodeFunctionData('upgradeToAndCall', [l2WethTokenImplAddress, upgradeData]);
}

async function getL1TxInfo(
    deployer: Deployer,
    to: string,
    l2Calldata: string,
    refundRecipient: string,
    gasPrice: ethers.BigNumber
) {
    const zksync = deployer.zkSyncContract(ethers.Wallet.createRandom().connect(provider));
    const l1Calldata = zksync.interface.encodeFunctionData('requestL2Transaction', [
        0,
        {
            l2Contract: to,
            l2Value: 0,
            gasAmount: 0,
            l2GasLimit: DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
            l2GasPerPubdataByteLimit: REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
        },
        l2Calldata,
        [], // It is assumed that the target has already been deployed
        refundRecipient
    ]);

    const neededValue = await zksync.l2TransactionBaseCost(
        gasPrice,
        DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
        REQUIRED_L2_GAS_PRICE_PER_PUBDATA
    );

    return {
        to: zksync.address,
        data: l1Calldata,
        value: neededValue.toString(),
        gasPrice: gasPrice.toString()
    };
}

async function main() {
    const program = new Command();

    program.version('0.1.0').name('initialize-l2-weth-token');

    const l2WethBridgeAddress = process.env.CONTRACTS_L2_WETH_BRIDGE_ADDR;
    const l2WethTokenProxyAddress = process.env.CONTRACTS_L2_WETH_TOKEN_PROXY_ADDR;
    const l2WethTokenImplAddress = process.env.CONTRACTS_L2_WETH_TOKEN_IMPL_ADDR;
    const tokens = getTokens(process.env.CHAIN_ETH_NETWORK || 'localhost');
    const l1WethTokenAddress = process.env.CONTRACTS_L1_WETH_TOKEN_ADDR;

    program
        .command('prepare-calldata')
        .option('--private-key <private-key>')
        .option('--gas-price <gas-price>')
        .action(async (cmd) => {
            const deployWallet = cmd.privateKey
                ? new Wallet(cmd.privateKey, provider)
                : Wallet.fromMnemonic(
                      process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
                      "m/44'/60'/0'/0/1"
                  ).connect(provider);
            console.log(`Using deployer wallet: ${deployWallet.address}`);

            const gasPrice = cmd.gasPrice ? parseUnits(cmd.gasPrice, 'gwei') : await provider.getGasPrice();
            console.log(`Using gas price: ${formatUnits(gasPrice, 'gwei')} gwei`);

            const deployer = new Deployer({
                deployWallet,
                governorAddress: deployWallet.address,
                verbose: true
            });

            const l2Calldata = getL2Calldata(l2WethBridgeAddress, l1WethTokenAddress, l2WethTokenImplAddress);
            const l1TxInfo = await getL1TxInfo(
                deployer,
                l2WethTokenProxyAddress,
                l2Calldata,
                ethers.constants.AddressZero,
                gasPrice
            );
            console.log(JSON.stringify(l1TxInfo, null, 4));
            console.log('IMPORTANT: gasPrice that you provide in the transaction should <= to the one provided above.');
        });

    program
        .command('instant-call')
        .option('--private-key <private-key>')
        .option('--gas-price <gas-price>')
        .option('--nonce <nonce>')
        .action(async (cmd) => {
            const deployWallet = cmd.privateKey
                ? new Wallet(cmd.privateKey, provider)
                : Wallet.fromMnemonic(
                      process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
                      "m/44'/60'/0'/0/1"
                  ).connect(provider);
            console.log(`Using deployer wallet: ${deployWallet.address}`);

            const gasPrice = cmd.gasPrice ? parseUnits(cmd.gasPrice, 'gwei') : await provider.getGasPrice();
            console.log(`Using gas price: ${formatUnits(gasPrice, 'gwei')} gwei`);

            const nonce = cmd.nonce ? parseInt(cmd.nonce) : await deployWallet.getTransactionCount();
            console.log(`Using deployer nonce: ${nonce}`);

            const deployer = new Deployer({
                deployWallet,
                governorAddress: deployWallet.address,
                verbose: true
            });

            const zkSync = deployer.zkSyncContract(deployWallet);
            const requiredValueToInitializeBridge = await zkSync.l2TransactionBaseCost(
                gasPrice,
                DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
                REQUIRED_L2_GAS_PRICE_PER_PUBDATA
            );
            const calldata = getL2Calldata(l2WethBridgeAddress, l1WethTokenAddress, l2WethTokenImplAddress);

            const tx = await zkSync.requestL2Transaction(
                requiredValueToInitializeBridge.mul(2),
                {
                    l2Contract: l2WethTokenProxyAddress,
                    l2Value: 0,
                    gasAmount: requiredValueToInitializeBridge,
                    l2GasLimit: DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
                    l2GasPerPubdataByteLimit: REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
                },
                calldata,
                [],
                deployWallet.address,
                {
                    gasPrice,
                }
            );
            const receipt = await tx.wait();

            console.log(`L2 WETH token initialized, gasUsed: ${receipt.gasUsed.toString()}`);
        });

    await program.parseAsync(process.argv);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
