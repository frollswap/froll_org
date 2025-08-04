let provider;
let signer;
let userAddress;

const frollAddress = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const swapAddress = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";
const diceAddress = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";

const frollAbi = [ // Chỉ cần fragment
  "function approve(address spender, uint amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint)",
  "function balanceOf(address account) external view returns (uint256)"
];
const swapAbi = [
  "function swapVicToFroll() external payable",
  "function swapFrollToVic(uint amount) external",
];
const diceAbi = [
  "function play(uint minBet, bool betOnEven) external",
  "function getBalance() external view returns (uint256)"
];

async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    document.getElementById("walletAddress").innerText = userAddress.slice(0, 6) + "..." + userAddress.slice(-4);
    updateFrollPrice();
  } else {
    alert("Please install MetaMask or use Viction wallet");
  }
}

document.getElementById("connectBtn").onclick = connectWallet;

function showSwap() {
  hideAll();
  document.getElementById("swap-interface").classList.remove("hidden");
}
function showDice() {
  hideAll();
  document.getElementById("dice-interface").classList.remove("hidden");
}
function hideAll() {
  document.getElementById("swap-interface").classList.add("hidden");
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

async function swap() {
  if (!signer) return alert("Connect wallet first");
  const direction = document.getElementById("swapDirection").value;
  const amount = document.getElementById("swapAmount").value;
  const swapContract = new ethers.Contract(swapAddress, swapAbi, signer);

  if (direction === "vicToFroll") {
    const fee = ethers.utils.parseEther("0.01");
    const vicAmount = ethers.utils.parseEther((amount * 100 + 0.01).toString());
    try {
      const tx = await swapContract.swapVicToFroll({ value: vicAmount });
      await tx.wait();
      alert("Swap successful!");
    } catch (e) {
      alert("Swap failed");
    }
  } else {
    const token = new ethers.Contract(frollAddress, frollAbi, signer);
    const decimals = 18;
    const frollAmount = ethers.utils.parseUnits(amount.toString(), decimals);
    const allowance = await token.allowance(userAddress, swapAddress);

    if (allowance.lt(frollAmount)) {
      const approveTx = await token.approve(swapAddress, frollAmount);
      await approveTx.wait();
    }

    try {
      const tx = await swapContract.swapFrollToVic(frollAmount);
      await tx.wait();
      alert("Swap successful!");
    } catch (e) {
      alert("Swap failed");
    }
  }
}

async function placeBet() {
  if (!signer) return alert("Connect wallet first");
  const minBet = document.getElementById("minBet").value;
  const betSide = window.selectedSide;
  if (!betSide || !minBet) return alert("Select side and enter minBet");

  const froll = new ethers.Contract(frollAddress, frollAbi, signer);
  const dice = new ethers.Contract(diceAddress, diceAbi, signer);
  const decimals = 18;
  const betAmount = ethers.utils.parseUnits(minBet.toString(), decimals);
  const allowance = await froll.allowance(userAddress, diceAddress);
  if (allowance.lt(betAmount)) {
    const tx = await froll.approve(diceAddress, betAmount);
    await tx.wait();
  }

  try {
    const tx = await dice.play(minBet, betSide === "even");
    await tx.wait();
    alert("Bet placed!");
  } catch (e) {
    alert("Bet failed");
  }
}

function chooseSide(side) {
  window.selectedSide = side;
  alert(`You selected ${side.toUpperCase()}`);
}
