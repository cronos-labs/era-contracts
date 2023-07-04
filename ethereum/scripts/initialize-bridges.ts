import { Command } from 'commander';
import { ethers, Wallet } from 'ethers';
import { Deployer } from '../src.ts/deploy';
import { formatUnits, parseUnits } from 'ethers/lib/utils';
import {
    computeL2Create2Address,
    web3Provider,
    hashL2Bytecode,
    applyL1ToL2Alias,
    getNumberFromEnv,
    REQUIRED_L2_GAS_PRICE_PER_PUBDATA
} from './utils';

import * as fs from 'fs';
import * as path from 'path';
import { WETH9Factory } from '../typechain';

const provider = web3Provider();
const testConfigPath = path.join(process.env.ZKSYNC_HOME as string, `etc/test_config/constant`);
const ethTestConfig = JSON.parse(fs.readFileSync(`${testConfigPath}/eth.json`, { encoding: 'utf-8' }));

const contractArtifactsPath = path.join(process.env.ZKSYNC_HOME as string, 'contracts/zksync/artifacts-zk/');

const l2BridgeArtifactsPath = path.join(contractArtifactsPath, 'cache-zk/solpp-generated-contracts/bridge/');

const openzeppelinTransparentProxyArtifactsPath = path.join(
    contractArtifactsPath,
    '@openzeppelin/contracts/proxy/transparent/'
);
const openzeppelinBeaconProxyArtifactsPath = path.join(contractArtifactsPath, '@openzeppelin/contracts/proxy/beacon');

function readBytecode(path: string, fileName: string) {
    return JSON.parse(fs.readFileSync(`${path}/${fileName}.sol/${fileName}.json`, { encoding: 'utf-8' })).bytecode;
}

function readInterface(path: string, fileName: string) {
    const abi = JSON.parse(fs.readFileSync(`${path}/${fileName}.sol/${fileName}.json`, { encoding: 'utf-8' })).abi;
    return new ethers.utils.Interface(abi);
}

const L2_ERC20_BRIDGE_PROXY_BYTECODE = readBytecode(
    openzeppelinTransparentProxyArtifactsPath,
    'TransparentUpgradeableProxy'
);
const L2_ERC20_BRIDGE_IMPLEMENTATION_BYTECODE = readBytecode(l2BridgeArtifactsPath, 'L2ERC20Bridge');
const L2_STANDARD_ERC20_IMPLEMENTATION_BYTECODE = readBytecode(l2BridgeArtifactsPath, 'L2StandardERC20');
const L2_STANDARD_ERC20_PROXY_BYTECODE = readBytecode(openzeppelinBeaconProxyArtifactsPath, 'BeaconProxy');
const L2_STANDARD_ERC20_PROXY_FACTORY_BYTECODE = readBytecode(
    openzeppelinBeaconProxyArtifactsPath,
    'UpgradeableBeacon'
);
const L2_ERC20_BRIDGE_INTERFACE = readInterface(l2BridgeArtifactsPath, 'L2ERC20Bridge');
const DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT = getNumberFromEnv('CONTRACTS_DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT');

async function main() {
    const program = new Command();

    program.version('0.1.0').name('initialize-bridges');

    program
        .option('--private-key <private-key>')
        .option('--gas-price <gas-price>')
        .option('--nonce <nonce>')
        .option('--erc20-bridge <erc20-bridge>')
        .action(async (cmd) => {
            const deployWallet = cmd.privateKey
                ? new Wallet(cmd.privateKey, provider)
                : Wallet.fromMnemonic(
                      process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
                      "m/44'/60'/0'/0/0"
                  ).connect(provider);
            console.log(`Using deployer wallet: ${deployWallet.address}`);

            const deployer = new Deployer({
                deployWallet,
                governorAddress: deployWallet.address,
                verbose: true
            });

            // mint weth token, with weth admin wallet
            const deploy2Wallet = cmd.privateKey
            ? new Wallet(cmd.privateKey, provider)
            : Wallet.fromMnemonic(
                  process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
                  "m/44'/60'/0'/0/1"
              ).connect(provider); 

            const wethTokenAddress = deployer.addresses.WethToken;
            console.log(wethTokenAddress);
            
            let weth9 = WETH9Factory.connect(wethTokenAddress, deploy2Wallet)
            const tx = await weth9.mint(deployWallet.address, ethers.utils.parseEther('10000000000'), {
                gasLimit: 210000,
            });
            await tx.wait()
            const weth9Balance = await weth9.balanceOf(deployWallet.address);
            console.log(`weth9Balance: ${ethers.utils.formatEther(weth9Balance)}`)

            // approve bridge for spending with the deployer wallet
            weth9 = WETH9Factory.connect(wethTokenAddress, deployWallet)
            const approveTx = await weth9.approve(deployer.addresses.ZkSync.MailboxFacet, ethers.utils.parseEther('10000000000'), {
                gasLimit: 210000,
            });
            const approveReceipt = await approveTx.wait()
            console.log(`approveReceipt: ${approveReceipt.transactionHash.toString()}`)
            let allowance = await weth9.allowance(deployWallet.address, deployer.addresses.ZkSync.MailboxFacet);
            console.log(`allowance: ${ethers.utils.formatEther(allowance)}`);



            const gasPrice = cmd.gasPrice ? parseUnits(cmd.gasPrice, 'gwei') : await provider.getGasPrice();
            console.log(`Using gas price: ${formatUnits(gasPrice, 'gwei')} gwei`);

            const nonce = cmd.nonce ? parseInt(cmd.nonce) : await deployWallet.getTransactionCount();
            console.log(`Using nonce: ${nonce}`);



            const zkSync = deployer.zkSyncContract(deployWallet);

            const erc20Bridge = cmd.erc20Bridge
                ? deployer.defaultERC20Bridge(deployWallet).attach(cmd.erc20Bridge)
                : deployer.defaultERC20Bridge(deployWallet);

            const priorityTxMaxGasLimit = getNumberFromEnv('CONTRACTS_PRIORITY_TX_MAX_GAS_LIMIT');
            const governorAddress = await zkSync.getGovernor();
            const abiCoder = new ethers.utils.AbiCoder();

            const l2ERC20BridgeImplAddr = computeL2Create2Address(
                applyL1ToL2Alias(erc20Bridge.address),
                L2_ERC20_BRIDGE_IMPLEMENTATION_BYTECODE,
                '0x',
                ethers.constants.HashZero
            );

            const proxyInitializationParams = L2_ERC20_BRIDGE_INTERFACE.encodeFunctionData('initialize', [
                erc20Bridge.address,
                hashL2Bytecode(L2_STANDARD_ERC20_PROXY_BYTECODE),
                governorAddress
            ]);
            const l2ERC20BridgeProxyAddr = computeL2Create2Address(
                applyL1ToL2Alias(erc20Bridge.address),
                L2_ERC20_BRIDGE_PROXY_BYTECODE,
                ethers.utils.arrayify(
                    abiCoder.encode(
                        ['address', 'address', 'bytes'],
                        [l2ERC20BridgeImplAddr, governorAddress, proxyInitializationParams]
                    )
                ),
                ethers.constants.HashZero
            );

            const l2StandardToken = computeL2Create2Address(
                l2ERC20BridgeProxyAddr,
                L2_STANDARD_ERC20_IMPLEMENTATION_BYTECODE,
                '0x',
                ethers.constants.HashZero
            );
            const l2TokenFactoryAddr = computeL2Create2Address(
                l2ERC20BridgeProxyAddr,
                L2_STANDARD_ERC20_PROXY_FACTORY_BYTECODE,
                ethers.utils.arrayify(abiCoder.encode(['address'], [l2StandardToken])),
                ethers.constants.HashZero
            );

            // There will be two deployments done during the initial initialization
            const requiredValueToInitializeBridge = await zkSync.l2TransactionBaseCost(
                gasPrice,
                DEPLOY_L2_BRIDGE_COUNTERPART_GAS_LIMIT,
                REQUIRED_L2_GAS_PRICE_PER_PUBDATA
            );

            const requiredValueToPublishBytecodes = await zkSync.l2TransactionBaseCost(
                gasPrice,
                priorityTxMaxGasLimit,
                REQUIRED_L2_GAS_PRICE_PER_PUBDATA
            );

            const independentInitialization = [
                zkSync.requestL2Transaction(
                    ethers.constants.AddressZero,
                    {
                        l2Value: 0,
                        gasAmount: requiredValueToPublishBytecodes,
                        l2GasLimit: priorityTxMaxGasLimit,
                        l2GasPerPubdataByteLimit: REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
                    },
                    '0x',
                    [L2_STANDARD_ERC20_PROXY_FACTORY_BYTECODE, L2_STANDARD_ERC20_IMPLEMENTATION_BYTECODE],
                    deployWallet.address,
                    { gasPrice, nonce, gasLimit: 2100000 }
                ),
                erc20Bridge.initialize(
                    [
                        L2_ERC20_BRIDGE_IMPLEMENTATION_BYTECODE,
                        L2_ERC20_BRIDGE_PROXY_BYTECODE,
                        L2_STANDARD_ERC20_PROXY_BYTECODE
                    ],
                    l2TokenFactoryAddr,
                    governorAddress,
                    requiredValueToInitializeBridge,
                    requiredValueToInitializeBridge,
                    {
                        gasPrice,
                        nonce: nonce + 1,
                        value: requiredValueToInitializeBridge.mul(2)
                    }
                )
            ];

            const txs = await Promise.all(independentInitialization);
            const receipts = await Promise.all(txs.map((tx) => tx.wait(2)));

            console.log(`ERC20 bridge initialized, gasUsed: ${receipts[1].gasUsed.toString()}`);
            console.log(`CONTRACTS_L2_ERC20_BRIDGE_ADDR=${await erc20Bridge.l2Bridge()}`);
        });

    await program.parseAsync(process.argv);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
