import { ethers } from 'ethers';
import { AllowListFactory, L1WethBridgeFactory, MailboxFacetFactory, WETH9Factory } from '../typechain';
import * as dotenv from "dotenv";
import { IZkSyncFactory } from '../typechain/IZkSyncFactory';
import { utils, Provider as ZkSyncProvider, Wallet as ZKWallet } from 'zksync-web3';
dotenv.config();


const WETH_ADDRESS = process.env.CONTRACTS_L1_WETH_TOKEN_ADDR!;
const L1_WETH_BRIDGE_ADDRESS = process.env.CONTRACTS_L1_WETH_BRIDGE_IMPL_ADDR!;
const MNEMONIC = process.env.MNEMONIC!;
const MAILBOX_ADDRESS = process.env.CONTRACTS_MAILBOX_FACET_ADDR!;
const ALLOW_LIST_ADDRESS = process.env.CONTRACTS_L1_ALLOW_LIST_ADDR!;
const ZKSYNC_ADDRESS = process.env.CONTRACTS_DIAMOND_PROXY_ADDR!;
const L2WETH_ADDRESS = process.env.CONTRACTS_L2_WETH_IMPLEMENTATION_ADDR!;

const DERIVE_PATH = "m/44'/60'/0'/0/1";

const prepare = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    wallet = wallet.connect(provider);
    console.log("balance: ", ethers.utils.formatEther(await wallet.getBalance()));
    const WETH = WETH9Factory.connect(WETH_ADDRESS, wallet);
    const L1WethBridge = L1WethBridgeFactory.connect(L1_WETH_BRIDGE_ADDRESS, wallet);
    const MailBox = MailboxFacetFactory.connect(MAILBOX_ADDRESS, wallet);
    const AllowList = AllowListFactory.connect(ALLOW_LIST_ADDRESS, wallet);
    const ZKSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);

    console.log("Mint WETH...");
    let tx = await WETH.mint(wallet.address, ethers.utils.parseEther("9999999999"), {
    });
    await tx.wait()
    
    const balance = await WETH.balanceOf(wallet.address);
    console.log("WETH balance: ", ethers.utils.formatEther(balance), "WETH");

    console.log("Approve L1WethBridge for spending WETH...");
    tx = await WETH.approve(L1WethBridge.address, ethers.utils.parseEther("9999999999"));
    await tx.wait();
    let allowance = await WETH.allowance(wallet.address, L1WethBridge.address);
    console.log("allowance: ", ethers.utils.formatEther(allowance), "WETH");

    console.log("Set access mode for L1WethBridge...");
    tx = await AllowList.setAccessMode(L1WethBridge.address, 2);
    await tx.wait();
    let res = await AllowList.getAccessMode(L1WethBridge.address)
    console.log("AccessMode for L1WethBridge: ", res);

    console.log("Set access mode for Mailbox...");
    tx = await AllowList.setAccessMode(MAILBOX_ADDRESS, 2);
    await tx.wait();
    res = await AllowList.getAccessMode(MAILBOX_ADDRESS)
    console.log("AccessMode for MailBox: ", res);

    console.log("Set access mode for zksync");
    tx = await AllowList.setAccessMode(ZKSYNC_ADDRESS, 2);
    await tx.wait();
    res = await AllowList.getAccessMode(ZKSYNC_ADDRESS);
    console.log("Accessmode for zksync: ", res);

    let v = await AllowList.canCall(wallet.address, MAILBOX_ADDRESS, MailBox.interface.getSighash("requestL2Transaction"))
    console.log("canCall: ", v);
    v = await AllowList.canCall(wallet.address, L1WethBridge.address, L1WethBridge.interface.getSighash("deposit"))
    console.log("canCall deposit: ", v);

    v = await AllowList.canCall(wallet.address, ZKSYNC_ADDRESS, ZKSync.interface.getSighash("requestL2Transaction"))
    console.log("canCall: ", v);

    tx = await AllowList.setDepositLimit(WETH_ADDRESS, false, ethers.utils.parseEther("9999999"))
    await tx.wait();
    let limit = await AllowList.getTokenDepositLimitData(WETH_ADDRESS);
    console.log("deposit limit: ", limit);
}

const main = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("balance: ", ethers.utils.formatEther(await wallet.getBalance()));
    const WETH = WETH9Factory.connect(WETH_ADDRESS, wallet);
    const L1WethBridge = L1WethBridgeFactory.connect(L1_WETH_BRIDGE_ADDRESS, wallet);
    const allowList = AllowListFactory.connect(await L1WethBridge.allowList(), wallet);
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);

    console.log("testing requestL2Transaction...");
    const MailBox = MailboxFacetFactory.connect(MAILBOX_ADDRESS, wallet);

    console.log("Deposit WETH to L2...")
    let value = await WETH.balanceOf(L1_WETH_BRIDGE_ADDRESS)
    console.log("bridge weth value: ", ethers.utils.formatEther(value));

    let l2Bridge = await L1WethBridge.l2Bridge();
    console.log("l2Bridge: ", l2Bridge);

    const DEPOSIT_L2_GAS_LIMIT = 10_000_000;

    const gasPrice = await wallet.getGasPrice();
    const contract = new ethers.Contract(process.env.CONTRACTS_DIAMOND_PROXY_ADDR, utils.ZKSYNC_MAIN_ABI, wallet);
    const expectedCost = await contract.l2TransactionBaseCost(
        gasPrice,
        DEPOSIT_L2_GAS_LIMIT,
        utils.DEFAULT_GAS_PER_PUBDATA_LIMIT
    );

    console.log("expectedCost: ", ethers.utils.formatEther(expectedCost));
    
    
    let tx = await L1WethBridge.deposit(
        wallet.address,
        WETH.address,
        ethers.utils.parseEther("999999999"),
        10_000_000,
        800,
        wallet.address,
        ethers.utils.parseEther("1"),
        {
            gasLimit: 210000,
            value: ethers.utils.parseEther("1")
        }
    )

    let receipt = await tx.wait();
    console.log(receipt);
    
    value = await WETH.balanceOf(L1_WETH_BRIDGE_ADDRESS)
    console.log("bridge weth value: ", ethers.utils.formatEther(value));
}

const testWorkingMailBox = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("balance: ", ethers.utils.formatEther(await wallet.getBalance()));
    const WETH = WETH9Factory.connect(WETH_ADDRESS, wallet);
    const L1WethBridge = L1WethBridgeFactory.connect(L1_WETH_BRIDGE_ADDRESS, wallet);
    const allowList = AllowListFactory.connect(await L1WethBridge.allowList(), wallet);
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);

    console.log("testing requestL2Transaction...");
    const MailBox = MailboxFacetFactory.connect(MAILBOX_ADDRESS, wallet);
    const DEPOSIT_L2_GAS_LIMIT = 10_000_000;

    const gasPrice = await wallet.getGasPrice();
    const contract = new ethers.Contract(process.env.CONTRACTS_DIAMOND_PROXY_ADDR, utils.ZKSYNC_MAIN_ABI, wallet);
    const AMOUNT_TO_DEPOSIT = ethers.utils.parseEther('1000000000000');
    const expectedCost = await contract.l2TransactionBaseCost(
        gasPrice,
        DEPOSIT_L2_GAS_LIMIT,
        utils.DEFAULT_GAS_PER_PUBDATA_LIMIT
    );
    const overrides = {
        value: AMOUNT_TO_DEPOSIT.add(expectedCost)
    };


    let tx = await contract.requestL2Transaction(
        wallet.address, 
        AMOUNT_TO_DEPOSIT, 
        "0x", 
        DEPOSIT_L2_GAS_LIMIT, 
        800, 
        [], 
        wallet.address, overrides
    )
    let receipt = await tx.wait();
    console.log(receipt);
}


const testMailBox = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("balance: ", ethers.utils.formatEther(await wallet.getBalance()));
    const WETH = WETH9Factory.connect(WETH_ADDRESS, wallet);
    const L1WethBridge = L1WethBridgeFactory.connect(L1_WETH_BRIDGE_ADDRESS, wallet);
    const allowList = AllowListFactory.connect(await L1WethBridge.allowList(), wallet);
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);

    console.log("testing requestL2Transaction...");
    const MailBox = MailboxFacetFactory.connect(MAILBOX_ADDRESS, wallet);
    const DEPOSIT_L2_GAS_LIMIT = 10_000_000;

    const gasPrice = await wallet.getGasPrice();
    const contract = new ethers.Contract(process.env.CONTRACTS_DIAMOND_PROXY_ADDR, utils.ZKSYNC_MAIN_ABI, wallet);
    const AMOUNT_TO_DEPOSIT = ethers.utils.parseEther('1000000000000');
    const expectedCost = await contract.l2TransactionBaseCost(
        gasPrice,
        DEPOSIT_L2_GAS_LIMIT,
        utils.DEFAULT_GAS_PER_PUBDATA_LIMIT
    );
    const overrides = {
        value: AMOUNT_TO_DEPOSIT.add(expectedCost)
    };


    let tx = await contract.requestL2Transaction(
        ethers.constants.AddressZero, 
        AMOUNT_TO_DEPOSIT, 
        "0x", 
        DEPOSIT_L2_GAS_LIMIT, 
        800, 
        [], 
        wallet.address, overrides
    )
    let receipt = await tx.wait();
    console.log(receipt);
}

const getBalance = async () => {

    let wallet = ZKWallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    
    const l2Provider = new ZkSyncProvider("http://localhost:3050");

    let balance = await l2Provider.getBalance(wallet.address)
    console.log("balance: ", ethers.utils.formatEther(balance));

    let wethBalance = await l2Provider.getBalance(wallet.address, "latest", L2WETH_ADDRESS);
    console.log("wethBalance: ", ethers.utils.formatEther(wethBalance));

    let ethBalance = await l2Provider.getBalance(wallet.address, "latest", "0x000000000000000000000000000000000000800a");
    console.log("ethBalance: ", ethers.utils.formatEther(ethBalance));
    

}


// prepare().then(() => {main()});

// mint token, set approval, set allowlist
// prepare();

// call the bridge function
// main();

getBalance();
