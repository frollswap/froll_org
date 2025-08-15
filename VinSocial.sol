// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVIN {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract VinSocial {
    address public owner;
    IVIN public vinToken;

    // phí tạo tài khoản 0.001 VIN
    uint256 public constant REGISTRATION_FEE = 0.001 ether;

    constructor(address _vinToken) {
        owner = msg.sender;
        vinToken = IVIN(_vinToken);
    }

    struct User { string name; string bio; string avatarUrl; string website; }
    struct Post { address author; string title; string content; string media; uint256 timestamp; }
    struct Comment { address commenter; string message; uint256 timestamp; }

    mapping(address => bool) private registered;
    mapping(address => User) public users;
    mapping(uint256 => Post) public posts;
    mapping(uint256 => Comment[]) public comments;
    mapping(uint256 => mapping(address => bool)) public liked;
    mapping(uint256 => uint256) public likeCount;
    mapping(uint256 => uint256) public shareCount;
    mapping(uint256 => uint256) public viewCount;

    mapping(address => mapping(address => bool)) public isFollowing;
    mapping(address => address[]) public followers;
    mapping(address => address[]) public following;
    mapping(address => uint256[]) public userPosts;

    uint256 public nextPostId = 1;

    event Registered(address indexed user);
    event PostCreated(uint256 indexed postId, address indexed author);
    event Liked(uint256 indexed postId, address indexed user);
    event Commented(uint256 indexed postId, address indexed user, string message);
    event Shared(uint256 indexed postId, address indexed user);
    event Viewed(uint256 indexed postId, address indexed viewer);
    event Followed(address indexed from, address indexed to);
    event Unfollowed(address indexed from, address indexed to);

    function isRegistered(address user) external view returns (bool) { return registered[user]; }

    function register(string memory name, string memory bio, string memory avatarUrl, string memory website) external {
        require(!registered[msg.sender], "Already registered");
        require(vinToken.transferFrom(msg.sender, address(this), REGISTRATION_FEE), "Transfer to contract failed");
        require(vinToken.transfer(owner, REGISTRATION_FEE), "Forward to owner failed");
        registered[msg.sender] = true;
        users[msg.sender] = User(name, bio, avatarUrl, website);
        emit Registered(msg.sender);
    }

    function createPost(string memory title, string memory content, string memory media) external {
        require(registered[msg.sender], "Not registered");
        // ↓ Cho phép tới 20,000 ký tự; xuống dòng được giữ nguyên (string đã hỗ trợ '\n')
        require(bytes(content).length <= 20000, "CONTENT_TOO_LONG");
        posts[nextPostId] = Post(msg.sender, title, content, media, block.timestamp);
        userPosts[msg.sender].push(nextPostId);
        emit PostCreated(nextPostId, msg.sender);
        nextPostId++;
    }

    function likePost(uint256 postId) external {
        require(registered[msg.sender], "Not registered");
        require(!liked[postId][msg.sender], "Already liked");
        liked[postId][msg.sender] = true;
        likeCount[postId]++;
        emit Liked(postId, msg.sender);
    }

    function commentOnPost(uint256 postId, string memory message) external {
        require(registered[msg.sender], "Not registered");
        comments[postId].push(Comment(msg.sender, message, block.timestamp));
        emit Commented(postId, msg.sender, message);
    }

    function sharePost(uint256 postId) external {
        require(registered[msg.sender], "Not registered");
        shareCount[postId]++;
        emit Shared(postId, msg.sender);
    }

    function viewPost(uint256 postId) external {
        viewCount[postId]++;
        emit Viewed(postId, msg.sender);
    }

    function follow(address user) external {
        require(registered[msg.sender], "Not registered");
        require(registered[user], "Target not registered");
        require(user != msg.sender, "Cannot follow self");
        require(!isFollowing[msg.sender][user], "Already following");
        isFollowing[msg.sender][user] = true;
        following[msg.sender].push(user);
        followers[user].push(msg.sender);
        emit Followed(msg.sender, user);
    }

    function unfollow(address user) external {
        require(isFollowing[msg.sender][user], "Not following");
        isFollowing[msg.sender][user] = false;
        _removeFromList(following[msg.sender], user);
        _removeFromList(followers[user], msg.sender);
        emit Unfollowed(msg.sender, user);
    }

    function _removeFromList(address[] storage list, address user) internal {
        for (uint i = 0; i < list.length; i++) {
            if (list[i] == user) { list[i] = list[list.length - 1]; list.pop(); break; }
        }
    }

    function getFollowers(address user) external view returns (address[] memory) { return followers[user]; }
    function getFollowing(address user) external view returns (address[] memory) { return following[user]; }
    function getUserPosts(address user) external view returns (uint256[] memory) { return userPosts[user]; }
    function getComments(uint256 postId) external view returns (Comment[] memory) { return comments[postId]; }
    function hasLiked(uint256 postId, address user) external view returns (bool) { return liked[postId][user]; }
    function isUserFollowing(address from, address to) external view returns (bool) { return isFollowing[from][to]; }
}
