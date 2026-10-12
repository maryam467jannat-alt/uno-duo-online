const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();
const COLORS = ["red", "blue", "green", "yellow"];
const VALUES = ["0","1","2","3","4","5","6","7","8","9","skip","reverse","draw2"];

function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: "0" });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color, value: String(n) }, { color, value: String(n) });
    }
    for (const value of ["skip", "reverse", "draw2"]) {
      deck.push({ color, value }, { color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "wild4" });
  }
  return shuffle(deck);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function drawCards(room, player, count) {
  for (let i = 0; i < count; i++) {
    if (!room.deck.length) {
      const top = room.discard.pop();
      room.deck = shuffle(room.discard);
      room.discard = [top];
    }
    if (room.deck.length) player.hand.push(room.deck.pop());
  }
}
function createGame(room) {
  room.deck = makeDeck();
  room.discard = [];
  room.players.forEach(p => { p.hand = []; });
  room.players.forEach(p => drawCards(room, p, 7));
  let first = room.deck.pop();
  while (first && first.color === "wild") {
    room.deck.unshift(first);
    first = room.deck.pop();
  }
  room.discard.push(first || { color: "red", value: "0" });
  room.currentColor = room.discard[0].color;
  room.turn = 0;
  room.status = "playing";
  room.winner = null;
  room.lastMessage = "Game started. Match the color or value.";
}
function publicState(room, socketId) {
  const you = room.players.findIndex(p => p.id === socketId);
  return {
    code: room.code,
    status: room.status,
    you,
    players: room.players.map((p, i) => ({
      name: p.name,
      count: (p.hand || []).length,
      isYou: i === you
    })),
    hand: you >= 0 ? (room.players[you].hand || []) : [],
    top: room.discard && room.discard.length ? room.discard[room.discard.length - 1] : { color: "red", value: "0" },
    currentColor: room.currentColor,
    turn: room.turn,
    winner: room.winner,
    lastMessage: room.lastMessage,
    deckCount: room.deck ? room.deck.length : 0
  };
}
function broadcast(room) {
  for (const p of room.players) {
    io.to(p.id).emit("state", publicState(room, p.id));
  }
}
function sendError(socket, message) {
  socket.emit("gameError", message);
}
function validName(name) {
  return String(name || "Player").trim().slice(0, 18) || "Player";
}
function nextTurn(room) {
  room.turn = (room.turn + 1) % 2;
}
function canPlay(card, top, currentColor) {
  return card.color === "wild" || card.color === currentColor || card.value === top.value;
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}) => {
    let code;
    do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
    const room = { code, players: [{ id: socket.id, name: validName(name), hand: [] }], status: "waiting" };
    rooms.set(code, room);
    socket.join(code);
    socket.emit("joined", { code });
    broadcast(room);
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return sendError(socket, "Room পাওয়া যায়নি। Code আবার দেখো।");
    if (room.players.length >= 2) return sendError(socket, "এই Room-এ ইতিমধ্যে ২ জন আছে।");
    if (room.status === "playing") return sendError(socket, "এই Game ইতিমধ্যে শুরু হয়েছে।");
    room.players.push({ id: socket.id, name: validName(name), hand: [] });
    socket.join(code);
    createGame(room);
    socket.emit("joined", { code });
    broadcast(room);
  });

  socket.on("playCard", ({ index, color } = {}) => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.status !== "playing") return sendError(socket, "Game এখন চালু নেই।");
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== room.turn) return sendError(socket, "এখন তোমার Turn নয়।");
    const player = room.players[playerIndex];
    const card = player.hand[Number(index)];
    if (!card) return sendError(socket, "কার্ডটি পাওয়া যায়নি।");
    const top = room.discard[room.discard.length - 1];
    if (!canPlay(card, top, room.currentColor)) return sendError(socket, "এই কার্ডটি এখন খেলা যাবে না।");
    if (card.color === "wild" && !COLORS.includes(color)) return sendError(socket, "Wild কার্ডের জন্য একটি রং বেছে নাও।");

    player.hand.splice(Number(index), 1);
    room.discard.push(card);
    room.currentColor = card.color === "wild" ? color : card.color;
    room.lastMessage = `${player.name} played ${card.value.toUpperCase()}${card.color === "wild" ? " — ${color}" : ""}.`;

    if (player.hand.length === 0) {
      room.status = "finished";
      room.winner = player.name;
      room.lastMessage = `${player.name} wins! 🎉`;
      broadcast(room);
      return;
    }
    if (card.value === "draw2") {
      nextTurn(room);
      drawCards(room, room.players[room.turn], 2);
      room.lastMessage += " Opponent draws 2 cards.";
      nextTurn(room);
    } else if (card.value === "wild4") {
      nextTurn(room);
      drawCards(room, room.players[room.turn], 4);
      room.lastMessage += " Opponent draws 4 cards.";
      nextTurn(room);
    } else if (card.value === "skip" || card.value === "reverse") {
      // In a two-player game, Skip and Reverse both give the same player another turn.
      room.lastMessage += " Play again!";
    } else {
      nextTurn(room);
    }
    broadcast(room);
  });

  socket.on("drawCard", () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.status !== "playing") return sendError(socket, "Game এখন চালু নেই।");
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== room.turn) return sendError(socket, "এখন তোমার Turn নয়।");
    drawCards(room, room.players[playerIndex], 1);
    room.lastMessage = `${room.players[playerIndex].name} drew a card.`;
    nextTurn(room);
    broadcast(room);
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (!room.players.length) rooms.delete(code);
        else {
          room.status = "waiting";
          room.lastMessage = "Opponent disconnected. Share the Room Code to start again in a new room.";
          broadcast(room);
        }
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`UNO Duo running on port ${PORT}`);
});
