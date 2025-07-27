// app.js cho FROLL.org

let provider;
let signer;
let userAddress;

// Kết nối ví
async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    document.getElementById("froll-price").innerText += ` | Wallet: ${shortenAddress(userAddress)}`;
  } else {
    alert("Please install MetaMask or use a Web3-enabled browser.");
  }
}

function shortenAddress(address) {
  return address.slice(0, 6) + "..." + address.slice(-4);
}

// Bấm nút SWAP
document.getElementById("show-swap").addEventListener("click", () => {
  document.getElementById("swap-interface").style.display = "block";
  document.getElementById("dice-interface").style.display = "none";
  document.getElementById("swap-interface").innerHTML = swapHTML();
});

// Bấm nút DICE
document.getElementById("show-dice").addEventListener("click", () => {
  document.getElementById("dice-interface").style.display = "block";
  document.getElementById("swap-interface").style.display = "none";
  document.getElementById("dice-interface").innerHTML = diceHTML();
});

// HTML của phần SWAP
function swapHTML() {
  return `
    <h2>🔁 Swap VIC ↔ FROLL</h2>
    <p>Connect wallet to swap your tokens on-chain.</p>
    <button class="button" onclick="alert('Swap coming soon!')">Swap Feature Coming Soon</button>
  `;
}

// HTML của phần GAME
function diceHTML() {
  return `
    <h2>🎲 Even or Odd Game</h2>
    <p>Choose your bet, stake FROLL, and roll!</p>
    <button class="button" onclick="alert('Game coming soon!')">Dice Game Coming Soon</button>
  `;
}

// Gọi hàm kết nối ví nếu cần tự động
window.addEventListener("load", () => {
  if (window.ethereum) {
    connectWallet();
  }
});
