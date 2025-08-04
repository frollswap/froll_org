let provider;
let signer;
let userAddress = null;

const frollAddress = "0xB4d562A8f811CE7F134a1982992Bd153902290BC"; // FROLL on VIC
const swapAddress = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068"; // FROLL/VIC Swap
const diceAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906"; // Dice game
const frollAbi = [ "function approve(address,uint256) external returns(bool)", "function allowance(address,address) external view returns(uint256)", "function balanceOf(address) external view returns(uint256)", "function decimals() view returns(uint8)" ];
const swapAbi = [ "function swapVicToFroll() payable", "function swapFrollToVic(uint256 amount)", "function addLiquidity() payable", "function withdraw()", "function getContractBalances() view returns(uint256,uint256)" ];
const diceAbi = [ "function play(uint256 minBet, bool guess) external payable", "function getBalance() view returns(uint256)", "function withdraw()" ];

async function connectWallet() {
  if (window.ethereum) {
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      userAddress = await signer.getAddress();
      document.getElementById("wallet-address").innerText = `Wallet: ${userAddress.substring(0, 6)}...${userAddress.slice(-4)}`;
      getVicBalance();
    } catch (err) {
      alert("Wallet connection failed.");
    }
  } else {
    alert("Please install MetaMask or Viction Wallet.");
  }
}

async function getVicBalance() {
  const balance = await provider.getBalance(userAddress);
  const ethBalance = ethers.utils.formatEther(balance);
  document.getElementById("wallet-balance").innerText = `Balance: ${parseFloat(ethBalance).toFixed(3)} VIC`;
}

async function getFrollPrice() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=VICUSDT");
    const data = await res.json();
    const vicPrice = parseFloat(data.price);
    const frollPrice = vicPrice * 100;
    document.getElementById("price-usd").innerText = `1 FROLL ≈ $${frollPrice.toFixed(2)} USD`;
  } catch (err) {
    document.getElementById("price-usd").innerText = "Failed to load price.";
  }
}

getFrollPrice();

function calculateSwapOutput() {
  const amount = parseFloat(document.getElementById("swap-amount").value || 0);
  const direction = document.getElementById("swap-direction").value;
  const fee = 0.01;

  if (direction === "vic-to-froll") {
    const net = amount - fee;
    const froll = net / 100;
    document.getElementById("swap-result").innerText = froll > 0 ? froll.toFixed(4) + " FROLL" : "0";
  } else {
    const vic = amount * 100 - fee;
    document.getElementById("swap-result").innerText = vic > 0 ? vic.toFixed(4) + " VIC" : "0";
  }
}

function updateSwapUI() {
  document.getElementById("swap-amount").value = "";
  document.getElementById("swap-result").innerText = "0";
}

async function approveToken() {
  try {
    const token = new ethers.Contract(frollAddress, frollAbi, signer);
    const allowance = await token.allowance(userAddress, swapAddress);
    const amount = ethers.utils.parseEther("1000000");

    if (allowance.lt(amount)) {
      const tx = await token.approve(swapAddress, amount);
      await tx.wait();
      alert("Approved FROLL successfully.");
    } else {
      alert("FROLL already approved.");
    }
  } catch (e) {
    alert("Approve failed.");
  }
}

async function executeSwap() {
  const amount = parseFloat(document.getElementById("swap-amount").value || 0);
  const direction = document.getElementById("swap-direction").value;

  if (!amount || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  const contract = new ethers.Contract(swapAddress, swapAbi, signer);

  try {
    if (direction === "vic-to-froll") {
      const tx = await contract.swapVicToFroll({ value: ethers.utils.parseEther(amount.toString()) });
      await tx.wait();
      alert("Swapped VIC → FROLL successfully.");
    } else {
      const tx = await contract.swapFrollToVic(ethers.utils.parseEther(amount.toString()));
      await tx.wait();
      alert("Swapped FROLL → VIC successfully.");
    }
    getVicBalance();
  } catch (err) {
    alert("Swap failed.");
  }
}

let currentMinBet = 0;

function setMinBet() {
  const input = document.getElementById("minBetInput").value;
  const min = parseFloat(input);
  if (!min || min <= 0) {
    alert("Enter a valid min bet.");
    return;
  }
  currentMinBet = min;
  alert(`Min bet set to ${min} FROLL.`);
}

async function placeBet(type) {
  if (!currentMinBet) {
    alert("Please set a table first.");
    return;
  }

  const amount = parseFloat(document.getElementById("betAmount").value);
  if (!amount || amount < currentMinBet) {
    alert(`Bet must be at least ${currentMinBet} FROLL.`);
    return;
  }

  const guess = type === "even";
  const contract = new ethers.Contract(diceAddress, diceAbi, signer);

  try {
    const tx = await contract.play(
      ethers.utils.parseEther(currentMinBet.toString()),
      guess,
      { value: ethers.utils.parseEther(amount.toString()) }
    );
    const receipt = await tx.wait();

    const resultText = `✅ Bet ${amount} FROLL on ${guess ? "Even" : "Odd"} → Tx: ${receipt.transactionHash.slice(0, 10)}...`;
    document.getElementById("dice-result").innerText = resultText;
    getVicBalance();
  } catch (e) {
    alert("Bet failed.");
  }
}

/* UI Switching */
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
  document.getElementById(id).classList.remove("hidden");
  document.getElementById(id).classList.add("active");
}
