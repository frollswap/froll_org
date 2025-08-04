let provider;
let signer;
let userAddress;
let selectedSide;
let currentBet = 0;

const frollAddress = "0xB4d562A8f811CE7F134a1982992Bd153902290BC"; // Địa chỉ hợp đồng FROLL
const diceAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906"; // Địa chỉ hợp đồng FrollDice

const frollAbi = [
  "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
  "function transfer(address recipient, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];
const diceAbi = [
  "function selectTable(uint256 _minBet) external",
  "function play(uint256 amount, bool guessEven) external",
  "function getBalance() external view returns (uint256)"
];

async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    document.getElementById("walletAddress").innerText = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    updateFrollBalance();
    updateFrollPrice();
  } else {
    alert("Please install MetaMask or use Viction wallet");
  }
}

document.getElementById("connectBtn").onclick = connectWallet;

async function updateFrollBalance() {
  const froll = new ethers.Contract(frollAddress, frollAbi, signer);
  const balance = await froll.balanceOf(userAddress);
  document.getElementById("frollBalance").innerText = `FROLL Balance: ${ethers.utils.formatUnits(balance, 18)}`;
}

function selectTable() {
  const minBet = document.getElementById("minBet").value;
  if (!minBet) return alert("Please enter a valid min bet amount.");

  const diceContract = new ethers.Contract(diceAddress, diceAbi, signer);
  diceContract.selectTable(ethers.utils.parseUnits(minBet, 18))
    .then(tx => tx.wait())
    .then(() => {
      alert("Table selected successfully!");
      document.getElementById("selectTable").style.display = "none";
      document.getElementById("gameControls").classList.remove("hidden");
    })
    .catch(e => alert("Failed to select table."));
}

function chooseSide(side) {
  selectedSide = side;
  alert(`You selected ${side.toUpperCase()}`);
}

function placeBet() {
  if (!selectedSide) return alert("Please select Even or Odd.");
  const minBet = document.getElementById("minBet").value;
  if (!minBet) return alert("Please enter a valid bet amount.");

  const froll = new ethers.Contract(frollAddress, frollAbi, signer);
  const dice = new ethers.Contract(diceAddress, diceAbi, signer);
  const betAmount = ethers.utils.parseUnits(minBet, 18);

  // Approve FROLL transfer
  froll.approve(diceAddress, betAmount).then(tx => tx.wait())
    .then(() => {
      return dice.play(betAmount, selectedSide === "even");
    })
    .then(tx => tx.wait())
    .then(() => {
      alert("Bet placed successfully!");
      document.getElementById("minBet").value = "";  // Clear bet input after placing
    })
    .catch(e => alert("Bet failed"));
}

function repeatBet() {
  document.getElementById("minBet").value = currentBet;
  placeBet();
}

function clearBet() {
  document.getElementById("minBet").value = "";
}

function doubleBet() {
  const currentAmount = document.getElementById("minBet").value;
  if (currentAmount) {
    document.getElementById("minBet").value = currentAmount * 2;
  }
}

function changeTable() {
  document.getElementById("gameControls").classList.add("hidden");
  document.getElementById("selectTable").style.display = "block";
}

function hideAll() {
  document.getElementById("dice-interface").classList.add("hidden");
}

async function updateFrollPrice() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=VICUSDT");
    const data = await res.json();
    const vicPrice = parseFloat(data.price);
    const frollUsd = (100 * vicPrice).toFixed(4);
    document.getElementById("priceDisplay").innerText = `1 FROLL = $${frollUsd}`;
  } catch (e) {
    document.getElementById("priceDisplay").innerText = "Unable to fetch price";
  }
}
