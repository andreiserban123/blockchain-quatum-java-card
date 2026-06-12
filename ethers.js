import "dotenv/config";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { Web3 } from "web3";

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const contractAddress = process.env.CONTRACT_ADDRESS;
const targetAddress = process.env.TARGET_ADDRESS;
const amountEth = process.env.AMOUNT_ETH ?? "0.001";
const withdrawAmountEth = process.env.WITHDRAW_AMOUNT_ETH ?? amountEth;
const sendEth = process.env.SEND_ETH === "true";

if (!rpcUrl || !privateKey) {
  throw new Error("Seteaza RPC_URL si PRIVATE_KEY in fisierul .env");
}

const { abi: faucetAbi } = JSON.parse(
  readFileSync(new URL("../build/Faucet.json", import.meta.url), "utf8"),
);

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

async function printEthereumInfo() {
  const [network, blockNumber, balance] = await Promise.all([
    provider.getNetwork(),
    provider.getBlockNumber(),
    provider.getBalance(wallet.address),
  ]);

  console.log("\n=== ETHERS: PROVIDER SI SOLD ===");
  console.log("Network:", network.name, "- chainId:", network.chainId.toString());
  console.log("Latest block:", blockNumber);
  console.log("Wallet address:", wallet.address);
  console.log("Wallet balance:", ethers.formatEther(balance), "ETH");

  // getBalance accepta orice adresa Ethereum; TARGET_ADDRESS nu trebuie sa aiba cheie privata.
  if (targetAddress) {
    const targetBalance = await provider.getBalance(targetAddress);
    console.log(
      "TARGET_ADDRESS balance:",
      ethers.formatEther(targetBalance),
      "ETH",
    );
  }
}

async function createTransferTransaction(destination) {
  const feeData = await provider.getFeeData();
  const transaction = {
    to: destination,
    value: ethers.parseEther(amountEth),
    nonce: await provider.getTransactionCount(wallet.address, "pending"),
    gasLimit: 21_000n,
    chainId: (await provider.getNetwork()).chainId,
  };

  // Retelele moderne folosesc tranzactii EIP-1559 (type 2).
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    transaction.type = 2;
    transaction.maxFeePerGas = feeData.maxFeePerGas;
    transaction.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else {
    transaction.gasPrice = feeData.gasPrice;
  }

  return transaction;
}

async function ethersTransferDemo() {
  const destination = targetAddress ?? wallet.address;
  const transaction = await createTransferTransaction(destination);

  console.log("\n=== ETHERS: CREARE SI SEMNARE TRANZACTIE ===");
  console.log("Transaction object:", transaction);

  // Semnarea este locala si nu publica tranzactia in blockchain.
  const signedTransaction = await wallet.signTransaction(transaction);
  console.log("Signed raw transaction:", signedTransaction);

  if (!sendEth) {
    console.log("SEND_ETH=false: tranzactia ethers nu este trimisa.");
    return;
  }

  if (!targetAddress) {
    throw new Error("Pentru trimitere seteaza TARGET_ADDRESS in .env");
  }

  // broadcastTransaction trimite exact tranzactia serializata si semnata mai sus.
  const response = await provider.broadcastTransaction(signedTransaction);
  console.log("Ethers transaction hash:", response.hash);
  const receipt = await response.wait();
  console.log("Ethers mined in block:", receipt.blockNumber);
}

async function faucetDemo() {
  if (!contractAddress) {
    console.log("\nCONTRACT_ADDRESS lipseste: demonstratia Faucet este omisa.");
    return;
  }

  const code = await provider.getCode(contractAddress);
  if (code === "0x") {
    throw new Error(`Nu exista smart contract la ${contractAddress}`);
  }

  const faucet = new ethers.Contract(contractAddress, faucetAbi, wallet);
  const faucetBalance = await provider.getBalance(contractAddress);

  console.log("\n=== ETHERS: INTERACTIUNE CU SMART CONTRACTUL FAUCET ===");
  console.log("Contract address:", await faucet.getAddress());
  console.log("Contract balance:", ethers.formatEther(faucetBalance), "ETH");

  // receive() este functia payable fara nume; este apelata printr-un transfer simplu.
  const donationTransaction = {
    to: contractAddress,
    value: ethers.parseEther(amountEth),
  };

  // populateTransaction encodeaza apelul withdraw(uint256), dar nu il trimite.
  const withdrawTransaction = await faucet.withdraw.populateTransaction(
    ethers.parseEther(withdrawAmountEth),
  );
  console.log("Donation transaction:", donationTransaction);
  console.log("Encoded withdraw transaction:", withdrawTransaction);

  if (!sendEth) {
    console.log("SEND_ETH=false: interactiunile care modifica Faucet sunt omise.");
    return;
  }

  const donationResponse = await wallet.sendTransaction(donationTransaction);
  await donationResponse.wait();
  console.log("Donation hash:", donationResponse.hash);

  const withdrawResponse = await faucet.withdraw(
    ethers.parseEther(withdrawAmountEth),
  );
  await withdrawResponse.wait();
  console.log("Withdraw hash:", withdrawResponse.hash);
}

async function web3Demo() {
  const web3 = new Web3(rpcUrl);
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  const destination = targetAddress ?? account.address;
  const feeData = await provider.getFeeData();

  console.log("\n=== WEB3.JS PENTRU ETHEREUM ===");
  console.log("Account:", account.address);
  console.log(
    "Balance:",
    web3.utils.fromWei(await web3.eth.getBalance(account.address), "ether"),
    "ETH",
  );

  const web3Transaction = {
    from: account.address,
    to: destination,
    value: web3.utils.toWei(amountEth, "ether"),
    gas: 21_000,
    nonce: await web3.eth.getTransactionCount(account.address, "pending"),
    chainId: Number((await provider.getNetwork()).chainId),
  };

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    web3Transaction.type = 2;
    web3Transaction.maxFeePerGas = feeData.maxFeePerGas.toString();
    web3Transaction.maxPriorityFeePerGas =
      feeData.maxPriorityFeePerGas.toString();
  } else if (feeData.gasPrice) {
    web3Transaction.gasPrice = feeData.gasPrice.toString();
  }

  const signed = await web3.eth.accounts.signTransaction(
    web3Transaction,
    privateKey,
  );
  console.log("Web3 signed raw transaction:", signed.rawTransaction);

  // Nu trimitem si varianta Web3 cand SEND_ETH=true: ar dubla plata demonstrata cu ethers.
  console.log("Trimitere Web3: web3.eth.sendSignedTransaction(rawTransaction)");
}

async function main() {
  await printEthereumInfo();
  await ethersTransferDemo();
  await faucetDemo();
  await web3Demo();
}

main().catch((error) => {
  console.error("\nEthereum error:", error.shortMessage ?? error.message);
  process.exitCode = 1;
});
