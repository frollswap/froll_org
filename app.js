// 👉 VinSocial.v3 – hỗ trợ xem bài khi chưa kết nối ví, copy ví, tìm kiếm
const vinSocialAddress = "0xAdd06EcD128004bFd35057d7a765562feeB77798";
const vinTokenAddress = "0x941F63807401efCE8afe3C9d88d368bAA287Fac4";

let provider, signer, userAddress;
let vinSocialContract, vinTokenContract, vinSocialReadOnly;
let isRegistered = false;
let lastPostId = 0;
let seen = new Set();

const vinTokenAbi = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)"
];

const vinSocialAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_vinToken",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "message",
        "type": "string"
      }
    ],
    "name": "Commented",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "Followed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "Liked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "author",
        "type": "address"
      }
    ],
    "name": "PostCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "Registered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "Shared",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "Unfollowed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "viewer",
        "type": "address"
      }
    ],
    "name": "Viewed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "REGISTRATION_FEE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "message",
        "type": "string"
      }
    ],
    "name": "commentOnPost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "comments",
    "outputs": [
      {
        "internalType": "address",
        "name": "commenter",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "message",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "title",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "content",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "media",
        "type": "string"
      }
    ],
    "name": "createPost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "follow",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "followers",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "following",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      }
    ],
    "name": "getComments",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "commenter",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "message",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "timestamp",
            "type": "uint256"
          }
        ],
        "internalType": "struct VinSocial.Comment[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getFollowers",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getFollowing",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getUserPosts",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "hasLiked",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isFollowing",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "isRegistered",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "isUserFollowing",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "likeCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      }
    ],
    "name": "likePost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "liked",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextPostId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "posts",
    "outputs": [
      {
        "internalType": "address",
        "name": "author",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "title",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "content",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "media",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "bio",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "avatarUrl",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "website",
        "type": "string"
      }
    ],
    "name": "register",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "shareCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      }
    ],
    "name": "sharePost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "unfollow",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "userPosts",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "users",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "bio",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "avatarUrl",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "website",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "viewCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "postId",
        "type": "uint256"
      }
    ],
    "name": "viewPost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "vinToken",
    "outputs": [
      {
        "internalType": "contract IVIN",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// 👉 Load giao diện khi mở trang
window.onload = async () => {
  if (window.ethereum) {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    vinSocialReadOnly = new ethers.Contract(vinSocialAddress, vinSocialAbi, provider);
    await tryAutoConnect();
  } else {
    provider = new ethers.providers.JsonRpcProvider("https://rpc.viction.xyz");
    vinSocialReadOnly = new ethers.Contract(vinSocialAddress, vinSocialAbi, provider);
    showHome(true); // vẫn cho xem bài khi chưa có ví
  }
};

// 👉 Kết nối ví
async function connectWallet() {
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  userAddress = await signer.getAddress();
  await setupContracts();
  vinSocialReadOnly = new ethers.Contract(vinSocialAddress, vinSocialAbi, provider);
  await updateUI();
}

// 👉 Ngắt kết nối ví
function disconnectWallet() {
  userAddress = null;
  isRegistered = false;
  document.getElementById("walletAddress").innerText = "Not connected";
  document.getElementById("connectBtn").style.display = "inline-block";
  document.getElementById("disconnectBtn").style.display = "none";
  document.getElementById("mainNav").style.display = "none";
  document.getElementById("mainContent").innerHTML = `<p class="tip">Tip: Use VIC chain in MetaMask. On mobile, open in the wallet's browser (e.g. Viction, MetaMask).</p>`;
}

// 👉 Gọi hợp đồng khi đã kết nối
async function setupContracts() {
  vinSocialContract = new ethers.Contract(vinSocialAddress, vinSocialAbi, signer);
  vinTokenContract = new ethers.Contract(vinTokenAddress, vinTokenAbi, signer);
}

// 👉 Tự kết nối lại nếu đã từng kết nối
async function tryAutoConnect() {
  const accounts = await provider.send("eth_accounts", []);
  if (accounts.length > 0) {
    userAddress = accounts[0];
    signer = provider.getSigner();
    await setupContracts();
    await updateUI();
  } else {
    showHome(true);
  }
}

// 👉 Hiển thị số dư ví và cập nhật menu
async function updateUI() {
  const vinBal = await vinTokenContract.balanceOf(userAddress);
  const vicBal = await provider.getBalance(userAddress);
  const vin = parseFloat(ethers.utils.formatEther(vinBal)).toFixed(2);
  const vic = parseFloat(ethers.utils.formatEther(vicBal)).toFixed(4);

  document.getElementById("walletAddress").innerHTML = `
    <span style="font-family: monospace;">${userAddress}</span>
    <button onclick="copyToClipboard('${userAddress}')" title="Copy address">📋</button>
    <span style="margin-left: 10px;">| ${vin} VIN | ${vic} VIC</span>
  `;

  document.getElementById("connectBtn").style.display = "none";
  document.getElementById("disconnectBtn").style.display = "inline-block";
  isRegistered = await vinSocialContract.isRegistered(userAddress);
  updateMenu();
  showHome(true);
}

// 👉 Nút copy ví
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Address copied to clipboard!");
  });
}

// 👉 Rút gọn ví (dùng cho hồ sơ, comment, v.v.)
function shorten(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// 👉 Hiển thị menu điều hướng
function updateMenu() {
  const nav = document.getElementById("mainNav");
  nav.style.display = "flex";
  if (isRegistered) {
    nav.innerHTML = `
      <button class="nav-btn" onclick="showHome(true)">🏠 Home</button>
      <button class="nav-btn" onclick="showProfile()">👤 My Profile</button>
      <button class="nav-btn" onclick="showNewPost()">✍️ New Post</button>
      <form onsubmit="searchByAddress(); return false;" style="margin-left: 10px;">
        <input type="text" id="searchInput" placeholder="Search wallet..." style="padding:4px; font-size:13px; border-radius:6px; border:1px solid #ccc;" />
        <button type="submit" style="padding:4px 8px; margin-left:5px; border-radius:6px; background:#007bff; color:white; border:none;">🔍</button>
      </form>
    `;
  } else {
    nav.innerHTML = `
      <button class="nav-btn" onclick="showHome(true)">🏠 Home</button>
      <button class="nav-btn" onclick="showRegister()">📝 Register</button>
    `;
  }
}

// 👉 Tìm kiếm theo địa chỉ ví
function searchByAddress() {
  const input = document.getElementById("searchInput").value.trim();
  if (!ethers.utils.isAddress(input)) {
    alert("Please enter a valid wallet address.");
    return;
  }
  viewProfile(input);
}

// 👉 Gán sự kiện kết nối / ngắt kết nối
document.getElementById("connectBtn").onclick = connectWallet;
document.getElementById("disconnectBtn").onclick = disconnectWallet;

// 👉 Hiển thị bài viết mới nhất (gồm ❤️, 🔁, 👁️ – không gọi viewPost để tiết kiệm gas)
async function showHome(reset = false) {
  if (reset) {
    lastPostId = 0;
    seen.clear();
    document.getElementById("mainContent").innerHTML = `<h2>Latest Posts</h2>`;
  }

  let html = "";
  if (lastPostId === 0) {
    try {
      const next = await vinSocialReadOnly.nextPostId();
      lastPostId = next.toNumber();
    } catch (e) {
      console.error("Cannot fetch nextPostId", e);
      return;
    }
  }

  let i = lastPostId - 1;
  let loaded = 0;

  while (i > 0 && loaded < 5) {
    if (seen.has(i)) {
      i--;
      continue;
    }

    try {
      const post = await vinSocialReadOnly.posts(i);
      if (post[0] === "0x0000000000000000000000000000000000000000" || post[4] === 0) {
        seen.add(i);
        i--;
        continue;
      }

      const key = `${post[1]}|${post[2]}|${post[4]}`;
      if (seen.has(key)) {
        i--;
        continue;
      }

      seen.add(i);
      seen.add(key);

      const fullAddress = post[0];
      const title = post[1];
      const content = post[2];
      const media = post[3];
      const time = new Date(post[4] * 1000).toLocaleString();

      const [likes, shares, views] = await Promise.all([
        vinSocialReadOnly.likeCount(i),
        vinSocialReadOnly.shareCount(i),
        vinSocialReadOnly.viewCount(i)
      ]);

      html += `
        <div class="post">
          <div class="title">${title}</div>
          <div class="author">
            <span style="font-family: monospace;">${fullAddress}</span>
            <button onclick="copyToClipboard('${fullAddress}')" title="Copy" style="margin-left: 4px;">📋</button>
            • ${time}
          </div>
          <div class="content">${content}</div>
          ${media ? `<img src="${media}" alt="media"/>` : ""}
          <div class="metrics">❤️ ${likes} • 🔁 ${shares} • 👁️ ${views}</div>
          <div class="actions">
            ${isRegistered ? `
              <button onclick="likePost(${i})">👍 Like</button>
              <button onclick="showComments(${i})">💬 Comment</button>
              <button onclick="sharePost(${i})">🔁 Share</button>
            ` : ""}
            <button onclick="viewProfile('${post[0]}')">👤 Profile</button>
            <button onclick="translatePost(decodeURIComponent('${encodeURIComponent(content)}'))">🌐 Translate</button>
          </div>
          <div id="comments-${i}"></div>
        </div>
      `;
      loaded++;
    } catch (err) {
      console.warn("Failed loading post", i, err);
    }
    i--;
  }

  lastPostId = i + 1;
  document.getElementById("mainContent").innerHTML += html;

  if (lastPostId > 1) {
    document.getElementById("mainContent").innerHTML += `
      <div style="text-align:center; margin-top:10px;">
        <button onclick="showHome()">⬇️ Load More</button>
      </div>
    `;
  }
}

// 👉 Dịch bài viết qua Google Translate
function translatePost(text) {
  const url = `https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(text)}&op=translate`;
  window.open(url, "_blank");
}

// 👉 Hiển thị form đăng ký tài khoản
function showRegister() {
  if (isRegistered) return alert("You are already registered.");
  document.getElementById("mainContent").innerHTML = `
    <h2>Register Account</h2>
    <form onsubmit="registerUser(); return false;">
      <label>Name*</label>
      <input type="text" id="regName" maxlength="32" required/>
      <label>Bio</label>
      <input type="text" id="regBio" maxlength="160"/>
      <label>Avatar URL</label>
      <input type="text" id="regAvatar"/>
      <label>Website</label>
      <input type="text" id="regWebsite"/>
      <button type="submit">Register (0.05 VIN)</button>
    </form>
  `;
}

// 👉 Gửi yêu cầu đăng ký tài khoản
async function registerUser() {
  const name = document.getElementById("regName").value.trim();
  const bio = document.getElementById("regBio").value.trim();
  const avatar = document.getElementById("regAvatar").value.trim();
  const website = document.getElementById("regWebsite").value.trim();
  const fee = ethers.utils.parseEther("0.05");

  try {
    const approveTx = await vinTokenContract.approve(vinSocialAddress, fee);
    await approveTx.wait();
    const tx = await vinSocialContract.register(name, bio, avatar, website);
    await tx.wait();
    alert("Registration successful!");
    await updateUI();
  } catch (err) {
    alert("Registration failed.");
    console.error(err);
  }
}

// 👉 Hiển thị form đăng bài
function showNewPost() {
  if (!isRegistered) return alert("You must register to post.");
  document.getElementById("mainContent").innerHTML = `
    <h2>New Post</h2>
    <form onsubmit="createPost(); return false;">
      <label>Title</label>
      <input type="text" id="postTitle" maxlength="80"/>
      <label>What's on your mind?</label>
      <textarea id="postContent" maxlength="20000" oninput="autoResize(this)" style="overflow:hidden; resize:none;"></textarea>
      <label>Image URL (optional)</label>
      <input type="text" id="postMedia"/>
      <button type="submit">Post</button>
    </form>
  `;
}

// 👉 Gửi bài viết
async function createPost() {
  const title = document.getElementById("postTitle").value.trim();
  const content = document.getElementById("postContent").value.trim();
  const media = document.getElementById("postMedia").value.trim();
  try {
    const tx = await vinSocialContract.createPost(title, content, media);
    await tx.wait();
    alert("Post created!");
    await showHome(true);
  } catch (err) {
    alert("Post failed.");
    console.error(err);
  }
}

// 👉 Tự động giãn chiều cao textarea
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

// 👉 Like bài viết
async function likePost(postId) {
  try {
    const tx = await vinSocialContract.likePost(postId);
    await tx.wait();
    alert("Liked!");
  } catch (err) {
    alert("Failed to like.");
    console.error(err);
  }
}

// 👉 Hiển thị & gửi bình luận
async function showComments(postId) {
  const el = document.getElementById(`comments-${postId}`);
  if (el.innerHTML) {
    el.innerHTML = "";
    return;
  }

  try {
    const comments = await vinSocialReadOnly.getComments(postId);
    let html = `<div class="comments"><h4>Comments</h4>`;
    comments.forEach(c => {
      const time = new Date(c.timestamp * 1000).toLocaleString();
      html += `<p><strong>${shorten(c.commenter)}:</strong> ${c.message} <span style="color:#999;">(${time})</span></p>`;
    });

    if (isRegistered) {
      html += `
        <form onsubmit="addComment(${postId}); return false;">
          <input type="text" id="comment-${postId}" placeholder="Add a comment..." required/>
          <button type="submit">Send</button>
        </form>
      `;
    } else {
      html += `<p>You must register to comment.</p>`;
    }

    html += `</div>`;
    el.innerHTML = html;
  } catch (err) {
    console.error("Failed to load comments", err);
  }
}

// 👉 Gửi bình luận
async function addComment(postId) {
  const msg = document.getElementById(`comment-${postId}`).value.trim();
  try {
    const tx = await vinSocialContract.commentOnPost(postId, msg);
    await tx.wait();
    alert("Comment added!");
    await showComments(postId); // refresh
  } catch (err) {
    alert("Failed to comment.");
    console.error(err);
  }
}

// 👉 Share bài viết
async function sharePost(postId) {
  try {
    const tx = await vinSocialContract.sharePost(postId);
    await tx.wait();
    alert("Post shared!");
  } catch (err) {
    alert("Share failed.");
    console.error(err);
  }
}

// 👉 Xem hồ sơ người dùng
async function viewProfile(addr) {
  try {
    const user = await vinSocialReadOnly.users(addr);
    const posts = await vinSocialReadOnly.getUserPosts(addr);
    const [followers, following] = await Promise.all([
      vinSocialReadOnly.getFollowers(addr),
      vinSocialReadOnly.getFollowing(addr)
    ]);

    let html = `<h2>${user[0]}'s Profile</h2>`;
    html += `<p><strong>Bio:</strong> ${user[1]}</p>`;
    html += `<p><strong>Website:</strong> <a href="${user[3]}" target="_blank">${user[3]}</a></p>`;
    html += `<p>👥 ${followers.length} Followers • ${following.length} Following</p>`;
    html += `<img src="${user[2]}" alt="avatar" style="max-width:100px;border-radius:50%;margin:10px 0"/>`;
    html += `<div class="actions">`;

    if (isRegistered && addr.toLowerCase() !== userAddress.toLowerCase()) {
      html += `
        <button onclick="followUser('${addr}')">👤 Follow</button>
        <button onclick="unfollowUser('${addr}')">🙅‍♂️ Unfollow</button>
      `;
    }

    html += `</div><h3>Posts</h3>`;

    for (const id of [...posts].reverse()) {
      const post = await vinSocialReadOnly.posts(id);
      const [likes, shares, views] = await Promise.all([
        vinSocialReadOnly.likeCount(id),
        vinSocialReadOnly.shareCount(id),
        vinSocialReadOnly.viewCount(id)
      ]);
      const time = new Date(post[4] * 1000).toLocaleString();

      html += `
        <div class="post">
          <div class="title">${post[1]}</div>
          <div class="author">${shorten(post[0])} • ${time}</div>
          <div class="content">${post[2]}</div>
          ${post[3] ? `<img src="${post[3]}" alt="media"/>` : ""}
          <div class="metrics">❤️ ${likes} • 🔁 ${shares} • 👁️ ${views}</div>
        </div>
      `;
    }

    document.getElementById("mainContent").innerHTML = html;
  } catch (err) {
    alert("Profile not available.");
    console.error(err);
  }
}

// 👉 Xem hồ sơ chính mình
async function showProfile() {
  if (!userAddress) return alert("Wallet not connected");
  await viewProfile(userAddress);
}

// 👉 Follow người dùng khác
async function followUser(addr) {
  try {
    const tx = await vinSocialContract.follow(addr);
    await tx.wait();
    alert("Now following!");
    await viewProfile(addr);
  } catch (err) {
    alert("Follow failed.");
    console.error(err);
  }
}

// 👉 Unfollow người dùng khác
async function unfollowUser(addr) {
  try {
    const tx = await vinSocialContract.unfollow(addr);
    await tx.wait();
    alert("Unfollowed.");
    await viewProfile(addr);
  } catch (err) {
    alert("Unfollow failed.");
    console.error(err);
  }
}

// 👉 (Chuẩn bị tương lai) Gợi ý người dùng nổi bật
async function suggestUsers() {
  return [];
}

// 👉 (Chuẩn bị tương lai) Gợi ý bài viết nổi bật
async function suggestPosts() {
  return [];
}

// 👉 Tìm kiếm mở rộng (ý tưởng tương lai)
async function searchByAddressOrKeyword(input) {
  if (ethers.utils.isAddress(input)) {
    await viewProfile(input);
  } else {
    alert("Currently only wallet address search is supported.");
  }
}

<!-- ▼▼▼ PASTE VÀO CUỐI app.js ▼▼▼ -->
// === Patch: Long posts + xuống dòng + auto-resize (UI-only) ===
(function () {
  // 1) Tiêm CSS để giữ xuống dòng khi HIỂN THỊ bài & comment
  const id = 'vin-patch-prewrap';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      .post .content { white-space: pre-wrap; word-break: break-word; }
      .comments p { white-space: pre-wrap; }
      textarea#postContent { overflow: hidden; resize: none; }
    `;
    document.head.appendChild(s);
  }

  // 2) Fallback autoResize nếu file cũ chưa có
  if (typeof window.autoResize !== 'function') {
    window.autoResize = function (ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    };
  }

  // 3) Override showNewPost: đặt maxlength=20000 + gắn auto-resize & giữ Enter
  window.showNewPost = function () {
    document.getElementById("mainContent").innerHTML = `
      <h2>New Post</h2>
      <form onsubmit="createPost(); return false;">
        <label>Title</label>
        <input type="text" id="postTitle" maxlength="80"/>
        <label>What's on your mind?</label>
        <textarea id="postContent" maxlength="20000" placeholder="Write here... (max 20,000 characters)"></textarea>
        <label>Image URL (optional)</label>
        <input type="text" id="postMedia" placeholder="https://..."/>
        <button type="submit">Post</button>
      </form>
    `;
    const ta = document.getElementById('postContent');
    const onChange = () => window.autoResize(ta);
    ['input','keyup','change'].forEach(evt => ta.addEventListener(evt, onChange));
    ta.addEventListener('paste', () => setTimeout(onChange, 0)); // sau khi dán mới đo scrollHeight
    onChange(); // set height lần đầu
  };

  // 4) Override createPost: không làm mất xuống dòng + chặn >20000
  window.createPost = async function () {
    const title = document.getElementById("postTitle").value.trim();
    const contentEl = document.getElementById("postContent");
    const content = contentEl.value; // GIỮ nguyên \n, không .trim() để tránh mất xuống dòng cuối
    const media = (document.getElementById("postMedia").value || '').trim();

    if (content.length > 20000) {
      alert(`Your post is ${content.length} characters. The maximum is 20,000.`);
      return;
    }

    try {
      const tx = await vinSocialContract.createPost(title, content, media);
      await tx.wait();
      alert("Post created!");
      await showHome(true);
    } catch (err) {
      alert("Post failed.");
      console.error(err);
    }
  };
})();
<!-- ▲▲▲ HẾT PATCH ▲▲▲ -->
