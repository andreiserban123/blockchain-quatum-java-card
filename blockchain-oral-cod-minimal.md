# Blockchain - raspuns oral si cod minimal

## 1. Interactiunea cu un smart contract

### Raspuns oral

Un contract este identificat prin adresa si ABI-ul sau. Pentru citire folosesc un
`Provider`, iar pentru modificarea starii folosesc un `Signer`. Functiile `view`
nu creeaza tranzactii, dar functiile care modifica starea consuma gas.

### Cod minimal

```js
const contract = new ethers.Contract(address, abi, signer);

console.log(await contract.retrieve()); // citire

const tx = await contract.store(54); // scriere
await tx.wait();
```

## 2. Obtinerea soldului ETH

### Raspuns oral

Soldul unei adrese este public. Providerul returneaza soldul in wei, iar
`formatEther` il converteste in ETH.

### Cod minimal

```js
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const balance = await provider.getBalance("0xADDRESS");

console.log(ethers.formatEther(balance));
```

## 3. Crearea unei tranzactii Ethereum

### Raspuns oral

Tranzactia contine cel putin destinatarul si valoarea. Providerul poate completa
sau estima nonce-ul, limita de gas si taxele.

### Cod minimal

```js
const transaction = {
  to: "0xDESTINATION",
  value: ethers.parseEther("0.01")
};
```

Campuri importante:

- `to`: adresa destinatarului;
- `value`: valoarea trimisa, exprimata in wei;
- `nonce`: numarul tranzactiei contului;
- `gasLimit`: limita maxima de gas;
- `maxFeePerGas`: taxa maxima acceptata;
- `maxPriorityFeePerGas`: bacsisul validatorului;
- `chainId`: identificatorul retelei.

## 4. Semnarea si trimiterea tranzactiei

### Raspuns oral

Cheia privata semneaza tranzactia si dovedeste autorizarea acesteia. Dupa
trimitere, `wait()` asteapta includerea tranzactiei intr-un bloc si returneaza
receipt-ul.

### Semnare si trimitere

```js
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const tx = await wallet.sendTransaction({
  to: "0xDESTINATION",
  value: ethers.parseEther("0.01")
});

const receipt = await tx.wait();
console.log(receipt.hash);
```

### Doar semnare, fara trimitere

```js
const signedTx = await wallet.signTransaction(transaction);
```

## 5. Functiile importante din Faucet

### Cod Solidity

```solidity
receive() external payable {}

function withdraw(uint256 amount) public {
    require(amount <= 0.1 ether);
    payable(msg.sender).transfer(amount);
}
```

### Raspuns oral

- `receive()` permite contractului sa primeasca ETH.
- `payable` indica faptul ca functia sau adresa poate primi ETH.
- `msg.sender` este adresa apelantului.
- `require` verifica o conditie si anuleaza executia daca aceasta este falsa.
- `transfer` trimite ETH catre o adresa `payable`.
- `withdraw` modifica starea blockchainului, deci necesita o tranzactie si gas.

Observatie: exemplul limiteaza valoarea unei singure retrageri, dar nu limiteaza
numarul retragerilor. Din acest motiv, nu reprezinta un Faucet sigur pentru
productie.

## 6. Web3.js pentru Ethereum

Trebuie cunoscute si recunoscute echivalentele API din Web3.js, chiar daca
accentul principal este pe ethers v6.

### Citirea soldului

```js
const { Web3 } = require("web3");
const web3 = new Web3(process.env.RPC_URL);

const wei = await web3.eth.getBalance("0xADDRESS");
console.log(web3.utils.fromWei(wei, "ether"));
```

### Semnarea si trimiterea unei tranzactii

```js
const account =
  web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);

const signed = await account.signTransaction({
  to: "0xDESTINATION",
  value: web3.utils.toWei("0.01", "ether"),
  gas: 21000
});

await web3.eth.sendSignedTransaction(signed.rawTransaction);
```

## 7. Obtinerea soldului XRP

### Raspuns oral

Adresa publica permite citirea soldului, dar nu permite trimiterea fondurilor.
Soldul XRP este stocat in drops, unde `1 XRP = 1.000.000 drops`.

### Cod minimal

```js
const response = await client.request({
  command: "account_info",
  account: "rADDRESS",
  ledger_index: "validated"
});

console.log(
  xrpl.dropsToXrp(response.result.account_data.Balance)
);
```

## 8. Tranzactie XRP

### Raspuns oral

Pentru trimiterea XRP nu este suficienta adresa sau cheia publica. Este necesar
seed-ul ori cheia privata pentru semnarea tranzactiei. `autofill` completeaza
campuri precum taxa, sequence si limita ledgerului, iar `submitAndWait` trimite
tranzactia si asteapta validarea sa.

### Cod minimal

```js
const xrpl = require("xrpl");

const client = new xrpl.Client(
  "wss://s.altnet.rippletest.net:51233"
);

await client.connect();

const wallet = xrpl.Wallet.fromSeed(process.env.XRP_SEED);

const payment = await client.autofill({
  TransactionType: "Payment",
  Account: wallet.address,
  Destination: "rDESTINATION",
  Amount: xrpl.xrpToDrops("5")
});

const signed = wallet.sign(payment);
const result = await client.submitAndWait(signed.tx_blob);

console.log(result.result.meta.TransactionResult);
await client.disconnect();
```

## Ce trebuie memorat

- **Adresa publica:** permite citirea soldului si primirea fondurilor.
- **Cheia privata sau seed-ul:** permite semnarea si controlul fondurilor.
- **Provider:** conexiune folosita pentru citirea blockchainului.
- **Signer/Wallet:** obiect folosit pentru semnare si trimitere.
- **Wei:** unitatea minima Ethereum; `1 ETH = 10^18 wei`.
- **Drops:** unitatea minima XRP; `1 XRP = 10^6 drops`.
- **ABI si adresa contractului:** sunt necesare pentru interactiunea cu acesta.
- **`call` sau functie `view`:** citire care nu modifica starea.
- **Tranzactie:** modifica starea blockchainului si consuma gas.
- **Receipt:** rezultatul executarii si includerii tranzactiei intr-un bloc.

## Regula de securitate

Cheile private, mnemonic-urile si seed-urile nu se scriu direct in cod. Se
incarca din variabile de mediu, iar exercitiile se ruleaza mai intai pe Testnet.
