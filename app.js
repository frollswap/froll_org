// Connect to MetaMask or Viction wallet
let provider;
let signer;
let userAddress;
let frollBalance = 0;
let vicBalance = 0;

const connectWalletBtn = document.getElementById('connect-wallet-btn');
const walletDetails = document.getElementById('wallet-details');
const walletAddress = document.getElementById('wallet-address');
const frollBalanceElement = document.getElementById('froll-balance');
const vicBalanceElement = document.getElementById('vic-balance');
const tableBtns = document.querySelectorAll('.table-btn');
const bettingInterface = document.getElementById('betting-interface');
const minBetElement = document.getElementById('min-bet');
const maxBetElement = document.getElementById('max-bet');
const betAmountInput = document.getElementById('bet-amount');
const placeBetBtn = document.getElementById('place-bet-btn');
const resetBetBtn = document.getElementById('reset-bet-btn');
const gameResult = document.getElementById('game-result');
const resultElement = document.getElementById('result');
const playAgainBtn = document.getElementById('play-again-btn');

connectWalletBtn.addEventListener('click', connectWallet);
placeBetBtn.addEventListener('click', placeBet);
resetBetBtn.addEventListener('click', resetBet);
playAgainBtn.addEventListener('click', resetGame);

async function connectWallet() {
  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    const network = await provider.getNetwork();

    if (network.chainId === 56) {
      const frollContract = new ethers.Contract(
        '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // Address of the FROLL contract
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      const vicContract = new ethers.Contract(
        '0x9197BF0813e0727df4555E8cb43a0977F4a3A068', // Address of the VIC contract
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      frollBalance = await frollContract.balanceOf(userAddress);
      vicBalance = await vicContract.balanceOf(userAddress);

      walletAddress.textContent = userAddress;
      frollBalanceElement.textContent = ethers.utils.formatUnits(frollBalance, 18);
      vicBalanceElement.textContent = ethers.utils.formatUnits(vicBalance, 18);

      walletDetails.style.display = 'block';
      connectWalletBtn.textContent = 'Disconnect Wallet';
      connectWalletBtn.removeEventListener('click', connectWallet);
      connectWalletBtn.addEventListener('click', disconnectWallet);

    } else {
      alert('Please connect to the BNB network.');
    }
  } else {
    alert('Please install MetaMask or Viction to continue.');
  }
}

function disconnectWallet() {
  window.location.reload();
}

tableBtns.forEach((btn) => {
  btn.addEventListener('click', (event) => {
    const minBet = parseFloat(event.target.getAttribute('data-min-bet'));
    const maxBet = parseFloat(event.target.getAttribute('data-max-bet'));
    minBetElement.textContent = minBet;
    maxBetElement.textContent = maxBet;

    bettingInterface.style.display = 'block';
  });
});

async function placeBet() {
  const betAmount = parseFloat(betAmountInput.value);
  const minBet = parseFloat(minBetElement.textContent);
  const maxBet = parseFloat(maxBetElement.textContent);

  if (betAmount < minBet || betAmount > maxBet) {
    alert('Bet amount out of range.');
    return;
  }

  if (betAmount > frollBalance) {
    alert('Insufficient FROLL balance.');
    return;
  }

  const frollContract = new ethers.Contract(
    '0xB4d562A8f811CE7F134a1982992Bd153902290BC', // Address of the FROLL contract
    ['function transfer(address recipient, uint256 amount)'],
    signer
  );

  const tx = await frollContract.transfer(
    '0xE2aa80dc03450C9E01f35BE4fcC7f76843020556', // Example recipient address (game contract)
    ethers.utils.parseUnits(betAmount.toString(), 18)
  );

  await tx.wait();
  alert('Bet placed successfully.');

  // Simulate game result
  simulateGameResult();
}

function resetBet() {
  betAmountInput.value = '';
}

function simulateGameResult() {
  const randomNumber = Math.floor(Math.random() * 100); // Generate a random number between 0 and 99

  let result = 'Lose';
  if (randomNumber < 50) {
    result = 'Win';
  }

  resultElement.textContent = result;
  gameResult.style.display = 'block';
}

function resetGame() {
  gameResult.style.display = 'none';
  bettingInterface.style.display = 'none';
  resetBet();
}
