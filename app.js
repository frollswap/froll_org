let provider, signer, userAddress;

const FROLL_ADDRESS = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const SWAP_ADDRESS = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";
const DICE_ADDRESS = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";
const FEE = ethers.utils.parseEther("0.01");

const FROLL_ABI = [
  "function approve(address spender, uint amount) external returns (bool)",
  "function balanceOf(address owner) view returns (uint)",
  "function decimals() view returns (uint8)"
];

const SWAP_ABI = [
  "function swapVicToFroll() payable",
  "function swapFrollToVic(uint amount)",
  "function getContractBalances() view returns (uint froll, uint vic)"
];

const DICE_ABI = [
  "function placeBet(bool isEven, uint amount, uint minBet)",
  "function getBalance() view returns (uint)"
];

window.onload = () => {
  updatePrice();
};

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("Please install MetaMask or a Web3 wallet.");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  userAddress = await signer.getAddress();

  document.getElementById("connect-wallet").innerText =
    "Connected: " + userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
}

async function executeSwap() {
  if (!signer) await connectWallet();

  const direction = document.getElementById("swap-direction").value;
  const amount = document.getElementById("swap-amount").value;
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    alert("Enter a valid amount.");
    return;
  }

  const swapContract = new ethers.Contract(SWAP_ADDRESS, SWAP_ABI, signer);
  const froll = new ethers.Contract(FROLL_ADDRESS, FROLL_ABI, signer);

  if (direction === "vic-to-froll") {
    const tx = await swapContract.swapVicToFroll({
      value: ethers.utils.parseEther(amount).add(FEE)
    });
    await tx.wait();
    alert("Swap VIC → FROLL successful!");
  } else {
    const decimals = await froll.decimals();
    const amt = ethers.utils.parseUnits(amount, decimals);
    const approveTx = await froll.approve(SWAP_ADDRESS, amt);
    await approveTx.wait();

    const tx = await swapContract.swapFrollToVic(amt);
    await tx.wait();
    alert("Swap FROLL → VIC successful!");
  }
}

function calculateSwapOutput() {
  const direction = document.getElementById("swap-direction").value;
  const input = parseFloat(document.getElementById("swap-amount").value || 0);
  const result = direction === "vic-to-froll"
    ? (input - 0.01) / 100
    : input * 100;
  document.getElementById("swap-result").innerText = result > 0 ? result.toFixed(4) : "0";
}

function updateSwapUI() {
  document.getElementById("swap-amount").value = "";
  document.getElementById("swap-result").innerText = "0";
}

function showHome() {
  document.querySelector(".container").style.display = "block";
  document.getElementById("swap-interface").classList.add("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

function showSwap() {
  document.querySelector(".container").style.display = "none";
  document.getElementById("swap-interface").classList.remove("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

function showDice() {
  document.querySelector(".container").style.display = "none";
  document.getElementById("swap-interface").classList.add("hidden");
  document.getElementById("dice-interface").classList.remove("hidden");
}

function disconnectWallet() {
  provider = signer = userAddress = null;
  document.getElementById("connect-wallet").innerText = "Connect Wallet";
  showHome();
}

async function updatePrice() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=VICUSDT");
    const data = await res.json();
    const vicPrice = parseFloat(data.price);
    const frollPrice = vicPrice * 100;
    document.getElementById("price-display").innerText = `1 FROLL ≈ $${frollPrice.toFixed(4)} USD`;
  } catch {
    document.getElementById("price-display").innerText = "Loading FROLL price...";
  }
}

// Dice Game
async function setMinBet() {
  const min = parseFloat(document.getElementById("minBetInput").value);
  if (!min || min <= 0) {
    alert("Invalid min bet");
    return;
  }
  alert(`Min bet set to ${min} FROLL`);
}

async function placeBet(type) {
  if (!signer) await connectWallet();

  const isEven = type === "even";
  const min = parseFloat(document.getElementById("minBetInput").value);
  const amount = parseFloat(document.getElementById("betAmount").value);
  if (!amount || amount < min) {
    alert("Invalid bet amount");
    return;
  }

  const froll = new ethers.Contract(FROLL_ADDRESS, FROLL_ABI, signer);
  const decimals = await froll.decimals();
  const amt = ethers.utils.parseUnits(amount.toString(), decimals);
  const minAmt = ethers.utils.parseUnits(min.toString(), decimals);

  const approveTx = await froll.approve(DICE_ADDRESS, amt);
  await approveTx.wait();

  const dice = new ethers.Contract(DICE_ADDRESS, DICE_ABI, signer);
  const tx = await dice.placeBet(isEven, amt, minAmt);
  await tx.wait();

  document.getElementById("dice-result").innerText = `🎉 Bet placed on ${isEven ? "Even" : "Odd"}!`;
}
