// app.js

const FROLL_ADDRESS = "0xB4d562A8f811CE7F134a1982992Bd153902290BC";
const SWAP_CONTRACT = "0x9197BF0813e0727df4555E8cb43a0977F4a3A068";
const DICE_CONTRACT = "0x85A12591d3BA2A7148d18e9Ca44E0D778e458906";
const FROLL_ABI = [...] // Đã cung cấp trước đó
const SWAP_ABI = [...] // Đã cung cấp trước đó
const DICE_ABI = [...] // Đã cung cấp trước đó

let provider, signer, froll, swap, dice, userAddress;

async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    froll = new ethers.Contract(FROLL_ADDRESS, FROLL_ABI, signer);
    swap = new ethers.Contract(SWAP_CONTRACT, SWAP_ABI, signer);
    dice = new ethers.Contract(DICE_CONTRACT, DICE_ABI, signer);
    return true;
  } else {
    alert("Please install MetaMask or a Web3 wallet.");
    return false;
  }
}

function disconnectWallet() {
  provider = signer = froll = swap = dice = userAddress = null;
}

function showHome() {
  document.querySelector(".container").style.display = "block";
  document.getElementById("swap-interface").classList.add("hidden");
  document.getElementById("dice-interface").classList.add("hidden");
}

async function showSwap() {
  const connected = await connectWallet();
  if (!connected) return;
  document.querySelector(".container").style.display = "none";
  document.getElementById("swap-interface").classList.remove("hidden");
  updateSwapUI();
}

async function showDice() {
  const connected = await connectWallet();
  if (!connected) return;
  document.querySelector(".container").style.display = "none";
  document.getElementById("dice-interface").classList.remove("hidden");
}

function updateSwapUI() {
  calculateSwapOutput();
}

function calculateSwapOutput() {
  const amount = parseFloat(document.getElementById("swap-amount").value);
  const direction = document.getElementById("swap-direction").value;
  const result = direction === "vic-to-froll" ? amount / 100 : amount * 100;
  document.getElementById("swap-result").textContent = result || 0;
}

async function executeSwap() {
  const amount = document.getElementById("swap-amount").value;
  const direction = document.getElementById("swap-direction").value;
  if (!amount || amount <= 0) return alert("Invalid amount");
  const value = ethers.utils.parseEther(amount);

  if (direction === "vic-to-froll") {
    const tx = await swap.swapVicToFroll({ value });
    await tx.wait();
  } else {
    const allowance = await froll.allowance(userAddress, SWAP_CONTRACT);
    if (allowance.lt(value)) {
      const approveTx = await froll.approve(SWAP_CONTRACT, ethers.constants.MaxUint256);
      await approveTx.wait();
    }
    const tx = await swap.swapFrollToVic(value);
    await tx.wait();
  }
  alert("Swap successful!");
}

function setMinBet() {
  const val = document.getElementById("minBetInput").value;
  if (val && parseFloat(val) > 0) {
    window.minBet = parseFloat(val);
    alert("Table set to " + val + " FROLL");
  }
}

async function placeBet(choice) {
  const amount = parseFloat(document.getElementById("betAmount").value);
  if (!amount || amount < window.minBet) {
    alert("Enter a valid amount above minimum table bet");
    return;
  }
  const value = ethers.utils.parseEther(amount.toString());
  const allowance = await froll.allowance(userAddress, DICE_CONTRACT);
  if (allowance.lt(value)) {
    const approveTx = await froll.approve(DICE_CONTRACT, ethers.constants.MaxUint256);
    await approveTx.wait();
  }
  const tx = await dice.play(choice === "even", value);
  const receipt = await tx.wait();
  const playedEvent = receipt.events.find(e => e.event === "Played");
  if (playedEvent) {
    const [player, amount, result, won] = playedEvent.args;
    document.getElementById("dice-result").textContent = `Result: ${result % 2 === 0 ? "Even" : "Odd"} | You ${won ? "Won" : "Lost"}!`;
  }
}

function copyText(el) {
  navigator.clipboard.writeText(el.innerText);
  el.style.background = "#ddd";
  setTimeout(() => (el.style.background = ""), 1000);
}
