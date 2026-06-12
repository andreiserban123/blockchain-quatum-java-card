import "dotenv/config";
import xrpl from "xrpl";

const rpcUrl =
  process.env.XRPL_RPC_URL ?? "wss://s.altnet.rippletest.net:51233";
const seed = process.env.XRPL_SEED;
const configuredPublicKey = process.env.XRPL_PUBLIC_KEY;
const destination = process.env.XRPL_DESTINATION;
const amountXrp = process.env.AMOUNT_XRP ?? "1";
const sendXrpl = process.env.SEND_XRPL === "true";
const runFaucet = process.env.RUN_XRPL_FAUCET === "true";

const client = new xrpl.Client(rpcUrl);

function publicKeyDemo(wallet) {
  const publicKey = configuredPublicKey ?? wallet?.publicKey;

  console.log("\n=== CHEIE PUBLICA SI ADRESA XRP ===");
  if (!publicKey) {
    console.log("Seteaza XRPL_PUBLIC_KEY sau XRPL_SEED pentru aceasta demonstratie.");
    return;
  }

  // Adresa clasica r... se poate deriva din cheia publica, fara seed/private key.
  const derivedAddress = xrpl.deriveAddress(publicKey);
  console.log("Public key:", publicKey);
  console.log("Derived classic address:", derivedAddress);

  if (wallet) {
    console.log("Wallet address:", wallet.address);
    console.log("Addresses match:", derivedAddress === wallet.address);
  }

  // Cheia publica identifica/verifica semnatarul, dar nu poate semna o plata.
  console.log("Pentru a trimite XRP este necesar seed-ul (cheia privata).");
}

async function faucetDemo() {
  if (!runFaucet) {
    return undefined;
  }

  // fundWallet este faucet-ul Testnet: genereaza un wallet si ii aloca XRP de test.
  const funding = await client.fundWallet();
  console.log("\n=== XRPL TESTNET FAUCET ===");
  console.log("Address:", funding.wallet.address);
  console.log("Public key:", funding.wallet.publicKey);
  console.log("Seed (secret, doar Testnet):", funding.wallet.seed);
  console.log("Funded balance:", funding.balance, "XRP");
  return funding.wallet;
}

async function printAccountInfo(address) {
  const balance = await client.getXrpBalance(address);
  console.log("\n=== XRPL ACCOUNT INFO ===");
  console.log("Address:", address);
  console.log("Balance:", balance, "XRP");

  // request permite apelarea directa a metodelor JSON-RPC oferite de rippled.
  const accountInfo = await client.request({
    command: "account_info",
    account: address,
    ledger_index: "validated",
  });
  console.log("Sequence:", accountInfo.result.account_data.Sequence);
}

async function paymentDemo(wallet) {
  if (!wallet) {
    console.log("\nXRPL_SEED lipseste: plata nu poate fi semnata.");
    return;
  }
  if (!destination) {
    console.log("\nXRPL_DESTINATION lipseste: plata nu este construita.");
    return;
  }

  const payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: destination,
    // XRP este reprezentat in drops: 1 XRP = 1.000.000 drops.
    Amount: xrpl.xrpToDrops(amountXrp),
  };

  // autofill adauga Fee, Sequence si LastLedgerSequence.
  const preparedTransaction = await client.autofill(payment);
  const signedTransaction = wallet.sign(preparedTransaction);
  const decodedSignedTransaction = xrpl.decode(signedTransaction.tx_blob);

  console.log("\n=== XRPL PAYMENT ===");
  console.log("Prepared transaction:", preparedTransaction);
  console.log("Fee:", xrpl.dropsToXrp(preparedTransaction.Fee), "XRP");
  console.log("Signing public key:", decodedSignedTransaction.SigningPubKey);
  console.log("Hash:", signedTransaction.hash);
  console.log("Signed tx_blob:", signedTransaction.tx_blob);

  if (!sendXrpl) {
    console.log("SEND_XRPL=false: tranzactia semnata nu este trimisa.");
    return;
  }

  const response = await client.submitAndWait(signedTransaction.tx_blob);
  const metadata = response.result.meta;
  if (typeof metadata === "string") {
    throw new Error(`Metadata XRPL neasteptata: ${metadata}`);
  }

  const transactionResult = metadata.TransactionResult;
  console.log("Validated hash:", response.result.hash);
  console.log("Result:", transactionResult);
  console.log(
    "Balance changes:",
    JSON.stringify(xrpl.getBalanceChanges(metadata), null, 2),
  );

  if (transactionResult !== "tesSUCCESS") {
    throw new Error(`Plata XRPL a esuat: ${transactionResult}`);
  }
}

async function main() {
  await client.connect();
  console.log("Connected to:", rpcUrl);

  const configuredWallet = seed ? xrpl.Wallet.fromSeed(seed) : undefined;
  const fundedWallet = await faucetDemo();
  const wallet = configuredWallet ?? fundedWallet;

  publicKeyDemo(wallet);

  if (wallet) {
    await printAccountInfo(wallet.address);
  }

  await paymentDemo(wallet);
}

main()
  .catch((error) => {
    console.error("\nXRPL error:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });
