import { deployedAddressesFromEnv } from '../src.ts/deploy';
import * as hardhat from 'hardhat';
import {Wallet} from "ethers";
import {web3Provider} from "./utils";
import path from "path";
import fs from "fs";

const provider = web3Provider();
const testConfigPath = path.join(process.env.ZKSYNC_HOME as string, `etc/test_config/constant`);
const ethTestConfig = JSON.parse(fs.readFileSync(`${testConfigPath}/eth.json`, { encoding: 'utf-8' }));

function verifyPromise(address: string, constructorArguments?: Array<any>, libraries?: object): Promise<any> {
    return new Promise((resolve, reject) => {
        hardhat
            .run('verify:verify', { address, constructorArguments, libraries })
            .then(() => resolve(`Successfully verified ${address}`))
            .catch((e) => reject(`Failed to verify ${address}\nError: ${e.message}`));
    });
}

async function main() {
    if (process.env.CHAIN_ETH_NETWORK == 'localhost') {
        console.log('Skip contract verification on localhost');
        return;
    }
    const addresses = deployedAddressesFromEnv();
    const promises = [];

    // Contracts without constructor parameters
    for (const address of [
        addresses.ZkSync.DiamondCutFacet,
        addresses.ZkSync.GettersFacet,
        addresses.ZkSync.DiamondInit,
        addresses.ZkSync.GovernanceFacet,
        addresses.ZkSync.MailboxFacet,
        addresses.ZkSync.ExecutorFacet,
        addresses.ZkSync.Verifier
    ]) {
        const promise = verifyPromise(address);
        promises.push(promise);
    }

    const deployWallet = Wallet.fromMnemonic(
            process.env.MNEMONIC ? process.env.MNEMONIC : ethTestConfig.mnemonic,
            "m/44'/60'/0'/0/1"
        ).connect(provider);
    const weth = verifyPromise(addresses.WethToken, [
        deployWallet.address
    ]);
    promises.push(weth);

    // TODO: Restore after switching to hardhat tasks (SMA-1711).
    // promises.push(verifyPromise(addresses.AllowList, [governor]));

    // // Proxy
    // {
    //     // Create dummy deployer to get constructor parameters for diamond proxy
    //     const deployer = new Deployer({
    //         deployWallet: ethers.Wallet.createRandom(),
    //         governorAddress: governor
    //     });

    //     const chainId = process.env.ETH_CLIENT_CHAIN_ID;
    //     const constructorArguments = [chainId, await deployer.initialProxyDiamondCut()];
    //     const promise = verifyPromise(addresses.ZkSync.DiamondProxy, constructorArguments);
    //     promises.push(promise);
    // }

    // Bridges
    const promise = verifyPromise(addresses.Bridges.ERC20BridgeImplementation, [
        addresses.ZkSync.DiamondProxy,
        addresses.AllowList
    ]);
    promises.push(promise);

    const promise2 = verifyPromise(addresses.Bridges.WethBridgeImplementation, [
        addresses.WethToken,
        addresses.ZkSync.DiamondProxy,
        addresses.AllowList
    ]);
    promises.push(promise2);

    const messages = await Promise.allSettled(promises);
    for (const message of messages) {
        console.log(message.status == 'fulfilled' ? message.value : message.reason);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error:', err.message || err);
        process.exit(1);
    });
