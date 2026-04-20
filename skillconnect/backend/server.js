// ============================================================
// server.js — Main entry point for SkillConnect backend
// Starts Express + HTTP server + Socket.io
// ============================================================
const express = require("express");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/errorMiddleware");

// Load env vars
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// ─── Socket.io setup ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://skiilconnect-qz4w.vercel.app", process.env.FRONTEND_URL || ""],
    methods: ["GET", "POST"],
  },
});

// Make io accessible in routes
app.set("io", io);

// ─── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: ["http://localhost:5173", "https://skiilconnect-qz4w.vercel.app", process.env.FRONTEND_URL || ""] }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// ─── Routes ───────────────────────────────────────────────────
app.use("/api/webhooks", require("./routes/webhookRoutes")); // Clerk webhooks (raw body needed)
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/applications", require("./routes/applicationRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/chat", require("./routes/chatRoutes")); // AI chatbot

app.get("/api/health", (req, res) => res.json({ status: "ok", message: "SkillConnect API running" }));

// ─── Error Handling ────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Socket.io Real-time Chat ─────────────────────────────────
const onlineUsers = new Map(); // userId -> socketId

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User joins with their userId
  socket.on("user:join", (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit("users:online", Array.from(onlineUsers.keys()));
  });

  // Send a message
  socket.on("message:send", async ({ senderId, receiverId, content, conversationId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    const messageData = { senderId, receiverId, content, conversationId, timestamp: new Date() };

    // Emit to receiver if online
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("message:receive", messageData);
    }
    // Echo back to sender
    socket.emit("message:receive", messageData);
  });

  // Typing indicators
  socket.on("typing:start", ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) io.to(receiverSocketId).emit("typing:start", { senderId: socket.id });
  });

  socket.on("typing:stop", ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) io.to(receiverSocketId).emit("typing:stop");
  });

  socket.on("disconnect", () => {
    // Remove from online users
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit("users:online", Array.from(onlineUsers.keys()));
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 SkillConnect server running on port ${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || "development"}`);
  console.log(`   URL:  http://localhost:${PORT}\n`);
});
