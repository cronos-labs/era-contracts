import { ethers } from 'ethers';
import { AllowListFactory, L1ERC20BridgeFactory, MailboxFacetFactory, CronosFactory, TestnetERC20TokenFactory } from '../typechain';
import * as dotenv from "dotenv";
import { IZkSyncFactory } from '../typechain/IZkSyncFactory';
import { utils, Provider as ZkSyncProvider, Wallet as ZKWallet } from 'zksync-web3';
import {REQUIRED_L2_GAS_PRICE_PER_PUBDATA} from "../scripts/utils";
dotenv.config();


const CRO_ADDRESS = process.env.CONTRACTS_L1_CRO_TOKEN_ADDR!;
const L1_ERC20_BRIDGE_ADDRESS = process.env.CONTRACTS_L1_ERC20_BRIDGE_IMPL_ADDR!;
const MNEMONIC = process.env.MNEMONIC!;
const MAILBOX_ADDRESS = process.env.CONTRACTS_MAILBOX_FACET_ADDR!;
const ALLOW_LIST_ADDRESS = process.env.CONTRACTS_L1_ALLOW_LIST_ADDR!;
const ZKSYNC_ADDRESS = process.env.CONTRACTS_DIAMOND_PROXY_ADDR!;
const L2ETH_ADDRESS = "0x000000000000000000000000000000000000800a";
const ERC20_ADDRESS = "0x9E0db25DB317F586d25f350F360D430dF39284a5";

const DERIVE_PATH = "m/44'/60'/0'/0/1";

const prepare = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("eth balance on wallet : ", ethers.utils.formatEther(await wallet.getBalance()));
    const CRO = CronosFactory.connect(CRO_ADDRESS, wallet);
    const L1ERC20Bridge = L1ERC20BridgeFactory.connect(L1_ERC20_BRIDGE_ADDRESS, wallet);
    const MailBox = MailboxFacetFactory.connect(MAILBOX_ADDRESS, wallet);
    const AllowList = AllowListFactory.connect(ALLOW_LIST_ADDRESS, wallet);
    const ZKSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);
    const ERC20 = TestnetERC20TokenFactory.connect(ERC20_ADDRESS, wallet)

    console.log("Mint CRO...");
    let tx = await CRO.mint(wallet.address, ethers.utils.parseEther("50"), {
    });
    await tx.wait()
    const balance = await CRO.balanceOf(wallet.address);
    console.log("CRO balance: ", ethers.utils.formatEther(balance), "CRO");

    console.log("Mint ERC20...");
    tx = await ERC20.mint(wallet.address, ethers.utils.parseEther("10000000"), {
    });
    await tx.wait()

    console.log("Set access mode for L1ERC20Bridge...");
    tx = await AllowList.setAccessMode(L1ERC20Bridge.address, 2);
    await tx.wait();
    let res = await AllowList.getAccessMode(L1ERC20Bridge.address)
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

    v = await AllowList.canCall(wallet.address, ZKSYNC_ADDRESS, MailBox.interface.getSighash("finalizeEthWithdrawal"))
    console.log("canCall finalizeEthWithdrawal: ", v);

    v = await AllowList.canCall(wallet.address, ZKSYNC_ADDRESS, ZKSync.interface.getSighash("requestL2Transaction"))
    console.log("canCall: ", v);

    tx = await AllowList.setDepositLimit(CRO_ADDRESS, false, ethers.utils.parseEther("9999999"))
    await tx.wait();
    let limit = await AllowList.getTokenDepositLimitData(CRO_ADDRESS);
    console.log("deposit limit: ", limit);

    tx = await AllowList.setDepositLimit(ERC20_ADDRESS, false, ethers.utils.parseEther("9999999"))
    await tx.wait();
    limit = await AllowList.getTokenDepositLimitData(CRO_ADDRESS);
    console.log("erc20 deposit limit: ", limit);
}

const testWorkingMailBox = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("balance: ", ethers.utils.formatEther(await wallet.getBalance()));
    const CRO = CronosFactory.connect(CRO_ADDRESS, wallet);
    const L1ERC20Bridge = L1ERC20BridgeFactory.connect(L1_ERC20_BRIDGE_ADDRESS, wallet);
    const allowList = AllowListFactory.connect(await L1ERC20Bridge.allowList(), wallet);
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);

    console.log("testing requestL2Transaction...");
    const MailBox = MailboxFacetFactory.connect(MAILBOX_ADDRESS, wallet);
    const DEPOSIT_L2_GAS_LIMIT = 10_000_000;

    const gasPrice = await wallet.getGasPrice();
    const contract = new ethers.Contract(process.env.CONTRACTS_DIAMOND_PROXY_ADDR, utils.ZKSYNC_MAIN_ABI, wallet);
    const AMOUNT_TO_DEPOSIT = ethers.utils.parseEther('10');
    const expectedCost = await contract.l2TransactionBaseCost(
        gasPrice,
        DEPOSIT_L2_GAS_LIMIT,
        utils.DEFAULT_GAS_PER_PUBDATA_LIMIT
    );

    let tx = await contract.requestL2Transaction(
        {
            l2Contract: wallet.address,
            l2Value: AMOUNT_TO_DEPOSIT,
            l2GasLimit: DEPOSIT_L2_GAS_LIMIT,
            l2GasPerPubdataByteLimit: 800,
        },
        "0x",
        [],
        wallet.address,
        AMOUNT_TO_DEPOSIT.add(expectedCost)
    )
    let receipt = await tx.wait();
    console.log(receipt);
}


const testMailBox = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("wallet: ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("ETH balance: ", ethers.utils.formatEther(await wallet.getBalance()));
    const CRO = CronosFactory.connect(CRO_ADDRESS, wallet);
    const L1ERC20Bridge = L1ERC20BridgeFactory.connect(L1_ERC20_BRIDGE_ADDRESS, wallet);
    const allowList = AllowListFactory.connect(await L1ERC20Bridge.allowList(), wallet);
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


    let tx = await contract.requestL2Transaction(
        {
            l2Contract: ethers.constants.AddressZero,
            l2Value: AMOUNT_TO_DEPOSIT,
            l2GasLimit: DEPOSIT_L2_GAS_LIMIT,
            l2GasPerPubdataByteLimit: 800,
        },
        "0x",
        [],
        wallet.address,
        AMOUNT_TO_DEPOSIT.add(expectedCost)
    )
    let receipt = await tx.wait();
    console.log(receipt);
}

const bridgeCROL1ToL2 = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("Use wallet address : ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    const CRO = CronosFactory.connect(CRO_ADDRESS, wallet);
    let l1Balance = await CRO.balanceOf(wallet.address);
    console.log("Current CRO balance on L1: ", ethers.utils.formatEther(l1Balance));

    const l2Provider = new ZkSyncProvider("http://127.0.0.1:3050");
    let l2balance = await l2Provider.getBalance(wallet.address)
    console.log("Current CRO balance on l2: ", ethers.utils.formatEther(l2balance));

    console.log("Approve ZKSync for spending CRO...");
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);
    let tx = await CRO.approve(zkSync.address, ethers.utils.parseEther("9999999999"));
    await tx.wait();
    let allowance = await CRO.allowance(wallet.address, zkSync.address);
    console.log("Bridge CRO allowance: ", ethers.utils.formatEther(allowance), "WETH");

    console.log("Depositing CRO");
    const DEPOSIT_L2_GAS_LIMIT = 1_000_000;
    const gasPrice = await wallet.getGasPrice();
    const contract = new ethers.Contract(ZKSYNC_ADDRESS, utils.ZKSYNC_MAIN_ABI, wallet);
    const expectedCost = await contract.l2TransactionBaseCost(
        gasPrice,
        DEPOSIT_L2_GAS_LIMIT,
        utils.DEFAULT_GAS_PER_PUBDATA_LIMIT
    );

    console.log("expectedCost: ", ethers.utils.formatEther(expectedCost));

    const tx2 = await zkSync.requestL2Transaction(
        {
            l2Contract: wallet.address,
            l2Value: 0,
            l2GasLimit: 1_000_000,
            l2GasPerPubdataByteLimit: 800,
        },
        '0x',
        [],
        wallet.address,
        ethers.utils.parseEther("100"),
        {
            gasLimit: 210000,
        }
    )

    let receipt = await tx2.wait();
    //console.log(receipt);

    l1Balance = await CRO.balanceOf(wallet.address);
    console.log("Current CRO balance on L1: ", ethers.utils.formatEther(l1Balance));

    l2balance = await l2Provider.getBalance(wallet.address)
    console.log("Current CRO balance on l2: ", ethers.utils.formatEther(l2balance));
}

const getBalance = async () => {
    let wallet = ZKWallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("Check balance for wallet address : ", wallet.address);
    let l1wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    const l1provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    l1wallet = l1wallet.connect(l1provider);
    const CRO = CronosFactory.connect(CRO_ADDRESS, l1wallet);
    const l1ethBalance = await l1provider.getBalance(l1wallet.address)
    console.log("ETH balance on l1: ", ethers.utils.formatEther(l1ethBalance), "CRO");
    const l1CROBalance = await CRO.balanceOf(l1wallet.address);
    console.log("CRO balance on l1: ", ethers.utils.formatEther(l1CROBalance), "CRO");

    const l2Provider = new ZkSyncProvider("http://127.0.0.1:3050");
    let balance = await l2Provider.getBalance(wallet.address)
    console.log("CRO balance on l2: ", ethers.utils.formatEther(balance));
    let croBalance = await l2Provider.getBalance(wallet.address, "latest", L2ETH_ADDRESS);
    console.log("CRO balance on l2 (2): ", ethers.utils.formatEther(croBalance));
    const ERC20 = TestnetERC20TokenFactory.connect(ERC20_ADDRESS, l1wallet);
    const l1erc20Balance = await ERC20.balanceOf(l1wallet.address);
    console.log("ERC20 balance on l1: ", ethers.utils.formatEther(l1erc20Balance), "DAI");
    const proxyBalance = await CRO.balanceOf(ZKSYNC_ADDRESS);
    console.log("Diamond proxy CRO balance: ", ethers.utils.formatEther(proxyBalance), "CRO");
}

const bridgeCROL2ToL1 = async () => {
    const l2Provider = new ZkSyncProvider("http://127.0.0.1:3050");
    const l1Provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    let zkwallet = ZKWallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    zkwallet = zkwallet.connect(l2Provider);
    let l1wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    l1wallet = l1wallet.connect(l1Provider);
    console.log("wallet: ", zkwallet.address);
    const CRO = CronosFactory.connect(CRO_ADDRESS, l1wallet);
    let l1CROBalance = await CRO.balanceOf(l1wallet.address);
    console.log("Current CRO balance on l1: ", ethers.utils.formatEther(l1CROBalance), "CRO");
    let l2balance = await l2Provider.getBalance(zkwallet.address)
    console.log("Current CRO balance on l2: ", ethers.utils.formatEther(l2balance));
    console.log("withdraw 10 CRO....");
    const withdrawL2 = await zkwallet.withdraw({
        token: L2ETH_ADDRESS,
        amount: ethers.utils.parseEther("10"),
        to: zkwallet.address
    });

    const receipt = await withdrawL2.waitFinalize();
    console.log("receipt: ", receipt.transactionHash);

    const { l1BatchNumber, l2MessageIndex, l2TxNumberInBlock, message, sender, proof } =
        await zkwallet.finalizeWithdrawalParams(receipt.transactionHash, 0);

    console.log("l1BatchNumber: ", l1BatchNumber);
    console.log("l2MessageIndex: ", l2MessageIndex);
    console.log("l2TxNumberInBlock: ", l2TxNumberInBlock);
    console.log("message: ", message);
    console.log("sender: ", sender);
    console.log("proof: ", proof);

    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);

    console.log("Finalize withdrawal...");
    let tx = await zkSync.finalizeEthWithdrawal(
        l1BatchNumber,
        l2MessageIndex,
        l2TxNumberInBlock,
        message,
        proof,
        {
            gasLimit: 410000,
        }
    )

    let finalizedReceipt = await tx.wait();
    //console.log(finalizedReceipt);

    l1CROBalance = await CRO.balanceOf(l1wallet.address);
    console.log("Current CRO balance on l1: ", ethers.utils.formatEther(l1CROBalance), "CRO");
    l2balance = await l2Provider.getBalance(zkwallet.address)
    console.log("Current CRO balance on l2: ", ethers.utils.formatEther(l2balance));
}

const bridgeERC20L1ToL2 = async () => {
    let wallet = ethers.Wallet.fromMnemonic(MNEMONIC, DERIVE_PATH);
    console.log("Use wallet address : ", wallet.address);
    const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    wallet = wallet.connect(provider);
    console.log("Current wallet balance on L2: ", ethers.utils.formatEther(await wallet.getBalance()));
    const L1ERC20Bridge = L1ERC20BridgeFactory.connect(L1_ERC20_BRIDGE_ADDRESS, wallet);

    console.log("Approve Bridge for spending DAI...");
    const ERC20 = TestnetERC20TokenFactory.connect(ERC20_ADDRESS, wallet);
    let tx = await ERC20.approve(L1ERC20Bridge.address, ethers.utils.parseEther("9999999999"));
    await tx.wait();
    let allowance = await ERC20.allowance(wallet.address, L1ERC20Bridge.address);
    console.log("erc20 allowance: ", ethers.utils.formatEther(allowance), "DAI");


    console.log("Approve ZKSync for spending gas token...");
    const zkSync = IZkSyncFactory.connect(ZKSYNC_ADDRESS, wallet);
    const CRO = CronosFactory.connect(CRO_ADDRESS, wallet);
    tx = await CRO.approve(zkSync.address, ethers.utils.parseEther("9999999999"));
    await tx.wait();
    allowance = await CRO.allowance(wallet.address, zkSync.address);
    console.log("gas token allowance allowance: ", ethers.utils.formatEther(allowance), "CRO");

    const DEPOSIT_L2_GAS_LIMIT = 10_000_000;
    const gasPrice = await wallet.getGasPrice();
    const contract = new ethers.Contract(process.env.CONTRACTS_DIAMOND_PROXY_ADDR, utils.ZKSYNC_MAIN_ABI, wallet);
    const expectedCost = await contract.l2TransactionBaseCost(
        gasPrice,
        DEPOSIT_L2_GAS_LIMIT,
        utils.DEFAULT_GAS_PER_PUBDATA_LIMIT
    );

    console.log("expectedCost: ", ethers.utils.formatEther(expectedCost));


    tx = await L1ERC20Bridge["deposit(address,address,uint256,uint256,uint256,address,uint256)"](
        wallet.address,
        ERC20_ADDRESS,
        ethers.utils.parseEther("100"),
        10_000_000,
        800,
        wallet.address,
        ethers.utils.parseEther("1"),
        {
            gasLimit: 410000,
        },
    )

    let receipt = await tx.wait();
    console.log(receipt);
}


// mint token, set approval, set allowlist
//prepare();

// call the bridge function
//bridgeCROL1ToL2();

//getBalance();

bridgeCROL2ToL1();

//bridgeERC20L1ToL2();
