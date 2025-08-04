const frollTokenAddress = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const diceContractAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";

let provider, signer, frollToken, diceContract, userAddress;

const frollAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const diceAbi = [
  "function selectTable(uint256 _minBet) external",
  "function play(uint256 amount, bool guessEven) external",
  "function playerTable(address) view returns (uint256 minBet, uint256 maxBet)",
  "function froll() view returns (address)"
];

async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    document.getElementById("wallet-address").innerText = userAddress;

    frollToken = new ethers.Contract(frollTokenAddress, frollAbi, signer);
    diceContract = new ethers.Contract(diceContractAddress, diceAbi, signer);

    updateBalances();
    showDice();
  } else {
    alert("Please install MetaMask or use a Web3-compatible wallet.");
  }
}

async function updateBalances() {
  if (!signer) return;

  const froll = await frollToken.balanceOf(userAddress);
  const vic = await provider.getBalance(userAddress);

  const frollFormatted = ethers.utils.formatUnits(froll, 18);
  const vicFormatted = ethers.utils.formatEther(vic);

  document.getElementById("wallet-balances").innerText = `FROLL: ${frollFormatted} | VIC: ${vicFormatted}`;
}

function showDice() {
  document.getElementById("home").classList.add("hidden");
  document.getElementById("dice-interface").classList.remove("hidden");
}

function showHome() {
  document.getElementById("home").classList.remove("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

async function setMinBet() {
  const minBetInput = document.getElementById("minBetInput").value;
  if (!minBetInput) return alert("Enter min bet");

  const minBetWei = ethers.utils.parseUnits(minBetInput, 18);
  try {
    const tx = await diceContract.selectTable(minBetWei);
    await tx.wait();
    alert("Table set!");
  } catch (err) {
    console.error(err);
    alert("Error setting table");
  }
}

async function placeBet(type) {
  const betAmountInput = document.getElementById("betAmount").value;
  if (!betAmountInput) return alert("Enter bet amount");

  const betWei = ethers.utils.parseUnits(betAmountInput, 18);
  const guessEven = type === "even";

  try {
    const approveTx = await frollToken.transferFrom(userAddress, diceContractAddress, betWei);
    await approveTx.wait();

    const playTx = await diceContract.play(betWei, guessEven);
    const receipt = await playTx.wait();

    const log = receipt.events.find(e => e.event === "Played");
    const win = log.args.win;
    const resultEven = log.args.resultEven;

    let msg = `🎲 Result: ${resultEven ? "Even" : "Odd"}\n`;
    msg += win ? "✅ You Win!" : "❌ You Lose!";
    document.getElementById("dice-result").innerText = msg;

    updateBalances();
  } catch (err) {
    console.error(err);
    alert("Bet failed");
  }
}
