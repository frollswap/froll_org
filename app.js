let provider, signer, userAddress;
const frollToken = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const swapContract = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";
const diceContract = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";

const frollAbi = [
  "function approve(address,uint256) external returns(bool)",
  "function allowance(address,address) external view returns(uint256)",
  "function balanceOf(address) external view returns(uint256)",
  "function decimals() external view returns(uint8)"
];

const swapAbi = [
  "function swapVicToFroll() payable",
  "function swapFrollToVic(uint256 amount)",
  "function getContractBalances() view returns(uint256 vic,uint256 froll)"
];

const diceAbi = [
  "function play(uint256 minBet, bool guess) external payable",
  "function getBalance() view returns(uint256)"
];

// ---------- KẾT NỐI VÍ + HIỂN THỊ SỐ DƯ ----------
async function connectWallet() {
  if (window.ethereum) {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    document.getElementById("wallet-address").innerText =
      "Wallet: " + userAddress.slice(0, 6) + "..." + userAddress.slice(-4);

    await updateBalances();
  } else {
    alert("Please install MetaMask or open in Viction Wallet.");
  }
}

async function updateBalances() {
  const vic = await provider.getBalance(userAddress);
  document.getElementById("wallet-vic").innerText =
    "VIC: " + ethers.utils.formatEther(vic).slice(0, 8);

  const froll = new ethers.Contract(frollToken, frollAbi, provider);
  const frollBal = await froll.balanceOf(userAddress);
  const decimals = await froll.decimals();
  document.getElementById("wallet-froll").innerText =
    "FROLL: " + (frollBal / 10 ** decimals).toFixed(4);

  getFrollPrice();
}

// ---------- HIỂN THỊ GIÁ FROLL (VIC x100) ----------
async function getFrollPrice() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=VICUSDT");
    const data = await res.json();
    const price = parseFloat(data.price);
    const frollPrice = price * 100;
    document.getElementById("price-usd").innerText = `1 FROLL ≈ $${frollPrice.toFixed(2)} USD`;
  } catch {
    document.getElementById("price-usd").innerText = "Price unavailable";
  }
}

function calculateSwapOutput() {
  const amount = parseFloat(document.getElementById("swap-amount").value || 0);
  const direction = document.getElementById("swap-direction").value;
  const fee = 0.01;

  if (direction === "vic-to-froll") {
    const net = amount - fee;
    const froll = net / 100;
    document.getElementById("swap-result").innerText =
      froll > 0 ? froll.toFixed(4) + " FROLL" : "0";
  } else {
    const vic = amount * 100 - fee;
    document.getElementById("swap-result").innerText =
      vic > 0 ? vic.toFixed(4) + " VIC" : "0";
  }
}

function updateSwapUI() {
  document.getElementById("swap-amount").value = "";
  document.getElementById("swap-result").innerText = "0";
}

async function approveToken() {
  const froll = new ethers.Contract(frollToken, frollAbi, signer);
  const allowance = await froll.allowance(userAddress, swapContract);
  const max = ethers.utils.parseEther("1000000");

  if (allowance.lt(max)) {
    const tx = await froll.approve(swapContract, max);
    await tx.wait();
    alert("Approved FROLL!");
  } else {
    alert("FROLL already approved.");
  }
}

async function executeSwap() {
  const amount = parseFloat(document.getElementById("swap-amount").value || 0);
  const direction = document.getElementById("swap-direction").value;
  const contract = new ethers.Contract(swapContract, swapAbi, signer);

  if (!amount || amount <= 0) {
    alert("Enter a valid amount.");
    return;
  }

  try {
    if (direction === "vic-to-froll") {
      const tx = await contract.swapVicToFroll({
        value: ethers.utils.parseEther(amount.toString())
      });
      await tx.wait();
      alert("Swapped VIC → FROLL");
    } else {
      const tx = await contract.swapFrollToVic(
        ethers.utils.parseEther(amount.toString())
      );
      await tx.wait();
      alert("Swapped FROLL → VIC");
    }
    await updateBalances();
  } catch (err) {
    console.error(err);
    alert("Swap failed.");
  }
}

let currentMinBet = 0;

function setMinBet() {
  const input = parseFloat(document.getElementById("minBetInput").value || 0);
  if (input <= 0) {
    alert("Enter a valid minimum bet.");
    return;
  }
  currentMinBet = input;
  alert(`Minimum bet set to ${input} FROLL`);
}

async function placeBet(type) {
  if (!currentMinBet) {
    alert("Please set a table first.");
    return;
  }

  const amount = parseFloat(document.getElementById("betAmount").value || 0);
  if (amount < currentMinBet) {
    alert(`Bet must be ≥ ${currentMinBet} FROLL`);
    return;
  }

  const guess = type === "even";
  const contract = new ethers.Contract(diceContract, diceAbi, signer);

  try {
    const tx = await contract.play(
      ethers.utils.parseEther(currentMinBet.toString()),
      guess,
      { value: ethers.utils.parseEther(amount.toString()) }
    );
    const receipt = await tx.wait();

    document.getElementById("dice-result").innerText =
      `✅ Bet ${amount} FROLL on ${guess ? "Even" : "Odd"}\nTx: ${receipt.transactionHash.slice(0, 10)}...`;
    
    await updateBalances();
  } catch (err) {
    console.error(err);
    alert("Bet failed.");
  }
}

// ---------- UI Switching ----------
function showHome() {
  setActive("home-screen");
}
function showSwap() {
  setActive("swap-interface");
}
function showDice() {
  setActive("dice-interface");
}
function setActive(id) {
  document.querySelectorAll(".section").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".section").forEach(el => el.classList.remove("active"));
  document.getElementById(id).classList.remove("hidden");
  document.getElementById(id).classList.add("active");
}
