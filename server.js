const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

// ===== TURN server credentials (fetched from Metered or env) =====
const TURN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: process.env.TURN_USERNAME || "openrelayproject",
    credential: process.env.TURN_CREDENTIAL || "openrelayproject",
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: process.env.TURN_USERNAME || "openrelayproject",
    credential: process.env.TURN_CREDENTIAL || "openrelayproject",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: process.env.TURN_USERNAME || "openrelayproject",
    credential: process.env.TURN_CREDENTIAL || "openrelayproject",
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: process.env.TURN_USERNAME || "openrelayproject",
    credential: process.env.TURN_CREDENTIAL || "openrelayproject",
  },
];

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Health check endpoint
    if (req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", online: onlineCount, uptime: process.uptime() }));
      return;
    }
    // ICE servers endpoint (client fetches TURN config)
    if (req.url === "/api/ice-servers") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ iceServers: TURN_SERVERS }));
      return;
    }
    handle(req, res);
  });

  const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  // ===== Data stores =====
  const waitingQueue = [];                    // { socketId, gender, name, ip, joinedAt }
  const activePairs = new Map();              // socketId -> partnerSocketId
  const userInfo = new Map();                 // socketId -> { gender, name, ip, joinedAt }
  const reportCount = new Map();              // socketId -> number of reports received
  const blockedPairs = new Set();             // "idA:idB" blocked combos
  const ipConnectionCount = new Map();        // ip -> count of active connections
  const ipLastAction = new Map();             // ip -> { action: timestamp } rate limiting
  let onlineCount = 0;

  // ===== Rate limiter =====
  const MAX_CONNECTIONS_PER_IP = 3;
  const RATE_LIMIT_WINDOW = 2000; // 2 seconds between rapid actions

  function getIp(socket) {
    return socket.handshake.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || socket.handshake.address
      || "unknown";
  }

  function isRateLimited(ip, action) {
    const key = `${ip}:${action}`;
    const last = ipLastAction.get(key) || 0;
    const now = Date.now();
    if (now - last < RATE_LIMIT_WINDOW) return true;
    ipLastAction.set(key, now);
    return false;
  }

  function removeFromQueue(socketId) {
    const idx = waitingQueue.findIndex((u) => u.socketId === socketId);
    if (idx !== -1) waitingQueue.splice(idx, 1);
  }

  function breakPair(socketId) {
    const partnerId = activePairs.get(socketId);
    if (partnerId) {
      activePairs.delete(partnerId);
      activePairs.delete(socketId);
    }
    return partnerId;
  }

  function getBlockKey(a, b) {
    return [a, b].sort().join(":");
  }

  // ===== Socket handling =====
  io.on("connection", (socket) => {
    const ip = getIp(socket);

    // Connection limit per IP
    const currentIpCount = ipConnectionCount.get(ip) || 0;
    if (currentIpCount >= MAX_CONNECTIONS_PER_IP) {
      socket.emit("error-msg", "Too many connections from your network. Try again later.");
      socket.disconnect(true);
      return;
    }
    ipConnectionCount.set(ip, currentIpCount + 1);

    onlineCount++;
    io.emit("online-count", onlineCount);
    console.log(`[+] ${socket.id} (${ip}) | Online: ${onlineCount}`);

    // ===== Join queue =====
    socket.on("join-queue", ({ gender, name }) => {
      if (isRateLimited(ip, "join")) {
        socket.emit("error-msg", "Too fast! Wait a moment.");
        return;
      }

      // Sanitize
      const safeName = String(name || "Anon").slice(0, 20).replace(/[<>"'/]/g, "");
      const safeGender = gender === "female" ? "female" : "male";

      userInfo.set(socket.id, { gender: safeGender, name: safeName, ip, joinedAt: Date.now() });
      removeFromQueue(socket.id);

      // Find match - prefer opposite gender, skip blocked pairs
      const opposite = safeGender === "male" ? "female" : "male";
      let matchIndex = -1;

      // First try opposite gender
      for (let i = 0; i < waitingQueue.length; i++) {
        const candidate = waitingQueue[i];
        if (candidate.gender === opposite && !blockedPairs.has(getBlockKey(socket.id, candidate.socketId))) {
          matchIndex = i;
          break;
        }
      }

      // Fallback: any gender
      if (matchIndex === -1) {
        for (let i = 0; i < waitingQueue.length; i++) {
          const candidate = waitingQueue[i];
          if (!blockedPairs.has(getBlockKey(socket.id, candidate.socketId))) {
            matchIndex = i;
            break;
          }
        }
      }

      if (matchIndex !== -1) {
        const partner = waitingQueue.splice(matchIndex, 1)[0];
        activePairs.set(socket.id, partner.socketId);
        activePairs.set(partner.socketId, socket.id);

        // Send TURN config along with match
        socket.emit("matched", {
          partnerId: partner.socketId,
          partnerName: partner.name,
          partnerGender: partner.gender,
          initiator: true,
          iceServers: TURN_SERVERS,
        });
        io.to(partner.socketId).emit("matched", {
          partnerId: socket.id,
          partnerName: safeName,
          partnerGender: safeGender,
          initiator: false,
          iceServers: TURN_SERVERS,
        });
        console.log(`[=] Matched: ${socket.id} <-> ${partner.socketId}`);
      } else {
        waitingQueue.push({ socketId: socket.id, gender: safeGender, name: safeName, ip });
        socket.emit("waiting");
      }
    });

    // ===== WebRTC signaling =====
    socket.on("offer", ({ to, offer }) => {
      if (activePairs.get(socket.id) === to) {
        io.to(to).emit("offer", { from: socket.id, offer });
      }
    });

    socket.on("answer", ({ to, answer }) => {
      if (activePairs.get(socket.id) === to) {
        io.to(to).emit("answer", { from: socket.id, answer });
      }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      if (activePairs.get(socket.id) === to) {
        io.to(to).emit("ice-candidate", { from: socket.id, candidate });
      }
    });

    // ===== Chat =====
    socket.on("chat-message", ({ to, message }) => {
      if (isRateLimited(ip, "chat")) return;
      if (activePairs.get(socket.id) !== to) return;
      // Sanitize message
      const safeMsg = String(message || "").slice(0, 500).replace(/[<>]/g, "");
      if (!safeMsg.trim()) return;
      io.to(to).emit("chat-message", { from: socket.id, message: safeMsg, timestamp: Date.now() });
    });

    // ===== Skip =====
    socket.on("skip", () => {
      if (isRateLimited(ip, "skip")) return;
      const partnerId = breakPair(socket.id);
      if (partnerId) {
        io.to(partnerId).emit("partner-skipped");
      }
    });

    // ===== Report =====
    socket.on("report", ({ reason }) => {
      const partnerId = activePairs.get(socket.id);
      if (!partnerId) return;
      const count = (reportCount.get(partnerId) || 0) + 1;
      reportCount.set(partnerId, count);
      console.log(`[!] Report: ${socket.id} reported ${partnerId} (${reason}) - total: ${count}`);

      // Auto-disconnect if reported 3+ times
      if (count >= 3) {
        io.to(partnerId).emit("error-msg", "You have been reported multiple times and disconnected.");
        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket) partnerSocket.disconnect(true);
      }

      socket.emit("report-ack");
    });

    // ===== Block =====
    socket.on("block", () => {
      const partnerId = activePairs.get(socket.id);
      if (!partnerId) return;
      blockedPairs.add(getBlockKey(socket.id, partnerId));
      // Disconnect pair
      breakPair(socket.id);
      io.to(partnerId).emit("partner-skipped");
      socket.emit("block-ack");
    });

    // ===== Leave =====
    socket.on("leave-queue", () => {
      removeFromQueue(socket.id);
      const partnerId = breakPair(socket.id);
      if (partnerId) {
        io.to(partnerId).emit("partner-disconnected");
      }
    });

    // ===== Disconnect =====
    socket.on("disconnect", () => {
      onlineCount = Math.max(0, onlineCount - 1);
      io.emit("online-count", onlineCount);

      // Reduce IP count
      const cnt = ipConnectionCount.get(ip) || 1;
      if (cnt <= 1) ipConnectionCount.delete(ip);
      else ipConnectionCount.set(ip, cnt - 1);

      removeFromQueue(socket.id);
      const partnerId = breakPair(socket.id);
      if (partnerId) {
        io.to(partnerId).emit("partner-disconnected");
      }
      userInfo.delete(socket.id);
      console.log(`[-] ${socket.id} | Online: ${onlineCount}`);
    });
  });

  // ===== Cleanup stale data every 5 minutes =====
  setInterval(() => {
    const now = Date.now();
    // Clean old rate limit entries
    for (const [key, ts] of ipLastAction.entries()) {
      if (now - ts > 60000) ipLastAction.delete(key);
    }
    // Clean old blocked pairs (expire after 1 hour)
    // blockedPairs are simple strings, can't easily expire - keep for session
  }, 5 * 60 * 1000);

  server.listen(PORT, () => {
    console.log(`\n🏔️  Himachal Connect running on port ${PORT}`);
    console.log(`   Environment: ${dev ? "development" : "production"}`);
    console.log(`   TURN: ${process.env.TURN_USERNAME ? "custom" : "default open relay"}\n`);
  });
});
