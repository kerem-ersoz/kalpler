// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

/* ---- Card helpers ---- */
const SUITS = ["S", "H", "C", "D"]; // ORDER: Spades, Hearts, Clubs, Diamonds
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const suitOf = (c) => c.slice(-1);
const rankOf = (c) => c.slice(0, -1);
const isHeart = (c) => suitOf(c) === "H";
const isQS = (c) => c === "QS";
const cardPoints = (c) => (isQS(c) ? 13 : isHeart(c) ? 1 : 0);

function createDeck() {
  const d = [];
  for (const s of ["C", "D", "H", "S"]) for (const r of RANKS) d.push(r + s);
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/* ---- Game ---- */
class Game {
  constructor() {
    this.players = []; // {id, name, socket, hand:[], tricksWon:[]}
    this.started = false;
    this.turnIndex = 0;
    this.currentTrick = []; // [{playerId, card}]
    this.tricksHistory = [];
    this.heartsBroken = false;
    this.firstTrick = true;
    this.finished = false;
    this.scores = {}; // playerId -> points
    this.lastCompletedTrick = null;
    this.rematchVotes = new Set();

    // typing indicator tracking (socketId/playerId -> ts)
    this.typingMap = new Map();
  }

  addPlayer(id, name, socket) {
    if (this.started) return false;
    if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return false;
    this.players.push({ id, name, socket, hand: [], tricksWon: [] });
    this.scores[id] = this.scores[id] ?? 0;
    return true;
  }
  removePlayer(id) {
    const i = this.players.findIndex(p => p.id === id);
    if (i !== -1) {
      this.players.splice(i, 1);
      delete this.scores[id];
      this.rematchVotes.delete(id);
    }
    this.typingMap.delete(id);
    this.broadcastTyping();
  }
  allJoined() { return this.players.length === 4; }
  getCurrentPlayer() { return this.players[this.turnIndex]; }

  sortHand(hand) {
    const suitOrder = { S: 0, H: 1, C: 2, D: 3 };
    const rIdx = (r) => RANKS.indexOf(r);
    return hand.sort((a, b) =>
      suitOrder[suitOf(a)] - suitOf(b) ||
      rIdx(rankOf(a)) - rIdx(rankOf(b))
    );
  }
  dealHands() {
    const deck = createDeck();
    shuffle(deck);
    this.players.forEach((p, i) => {
      p.hand = deck.slice(i * 13, (i + 1) * 13);
      p.tricksWon = [];
      p.hand = this.sortHand(p.hand);
    });
    this.turnIndex = this.players.findIndex(p => p.hand.includes("2C")); // first player = 2C holder
  }

  startNewGame(resetScores = true) {
    this.started = true;
    this.finished = false;
    this.heartsBroken = false;
    this.firstTrick = true;
    this.currentTrick = [];
    this.tricksHistory = [];
    this.lastCompletedTrick = null;
    this.rematchVotes.clear();
    if (resetScores) this.players.forEach(p => (this.scores[p.id] = 0));
    this.dealHands();
  }

  evaluateTrickWinner(trick) {
    const leadSuit = suitOf(trick[0].card);
    const rIdx = (r) => RANKS.indexOf(r);
    let bestI = 0;
    let bestR = rIdx(rankOf(trick[0].card));
    for (let i = 1; i < trick.length; i++) {
      const c = trick[i].card;
      if (suitOf(c) === leadSuit) {
        const rr = rIdx(rankOf(c));
        if (rr > bestR) { bestR = rr; bestI = i; }
      }
    }
    return trick[bestI].playerId;
  }

  playCard(playerId, card) {
    if (this.finished) return { error: "Game finished." };
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: "Player not found." };
    if (this.getCurrentPlayer().id !== playerId) return { error: "Not your turn." };
    if (!player.hand.includes(card)) return { error: "Card not in hand." };

    // First trick opening must be 2C
    if (this.firstTrick && this.currentTrick.length === 0 && card !== "2C") {
      return { error: "First trick must begin with 2 of Clubs." };
    }
    // Follow suit if possible
    if (this.currentTrick.length > 0) {
      const leadSuit = suitOf(this.currentTrick[0].card);
      if (suitOf(card) !== leadSuit) {
        if (player.hand.some(c => suitOf(c) === leadSuit)) {
          return { error: "Must follow suit." };
        }
      }
    } else {
      // Leading: no hearts until broken unless only hearts
      if (suitOf(card) === "H" && !this.heartsBroken) {
        if (!player.hand.every(c => suitOf(c) === "H")) return { error: "Cannot lead hearts (not broken)." };
      }
    }

    // apply play
    player.hand = player.hand.filter(c => c !== card);
    this.currentTrick.push({ playerId, card });
    if (suitOf(card) === "H") this.heartsBroken = true;

    if (this.currentTrick.length < 4) {
      this.turnIndex = (this.turnIndex + 1) % this.players.length;

      // First trick special 2C autoplayer (if 2nd player in first trick holds it)
      if (this.firstTrick && this.currentTrick.length === 1) {
        const nextP = this.getCurrentPlayer();
        if (nextP.hand.includes("2C")) {
          nextP.hand = nextP.hand.filter(c => c !== "2C");
          this.currentTrick.push({ playerId: nextP.id, card: "2C" });
          if (this.currentTrick.length < 4) this.turnIndex = (this.turnIndex + 1) % this.players.length;
        }
      }

      this.broadcastAll("updateGame");
      return { success: true, trickComplete: false };
    }

    // Trick reached 4 cards — ask clients to animate trick take, then finalize
    this.animateTrickThenFinalize();
    return { success: true, trickComplete: true, animating: true };
  }

  animateTrickThenFinalize() {
    const completed = this.currentTrick.slice();
    const winnerId = this.evaluateTrickWinner(completed);

    io.emit("trickComplete", { trick: completed, winnerId });

    setTimeout(() => {
      this.finalizeCompletedTrick(completed, winnerId);
    }, 820);
  }

  finalizeCompletedTrick(completed, winnerId) {
    const winner = this.players.find(p => p.id === winnerId);
    winner.tricksWon.push(...completed.map(t => t.card));
    this.tricksHistory.push(completed);
    this.lastCompletedTrick = completed.map(t => ({ playerId: t.playerId, card: t.card }));

    this.currentTrick = [];
    this.turnIndex = this.players.findIndex(p => p.id === winnerId);

    // Pin last trick & advance
    this.broadcastAll("lastTrick", this.lastCompletedTrick);

    const roundOverNow = this.players.every(p => p.hand.length === 0);
    if (roundOverNow) {
      this.completeRoundAndMaybeEnd();
      return;
    }

    if (this.players.every(p => p.hand.length === 1) && this.currentTrick.length === 0) {
      this.autoPlayLastTrick();
      return;
    }

    this.firstTrick = false;
    this.broadcastAll("updateGame");
  }

  autoPlayLastTrick() {
    for (let i = 0; i < 4; i++) {
      const p = this.players[(this.turnIndex + i) % 4];
      const card = p.hand[0];
      if (!card) continue;
      p.hand = [];
      this.currentTrick.push({ playerId: p.id, card });
      if (suitOf(card) === "H") this.heartsBroken = true;
    }
    const completed = this.currentTrick.slice();
    const winnerId = this.evaluateTrickWinner(completed);

    io.emit("trickComplete", { trick: completed, winnerId });

    setTimeout(() => {
      this.finalizeCompletedTrick(completed, winnerId);
    }, 820);
  }

  completeRoundAndMaybeEnd() {
    const roundPoints = {};
    this.players.forEach(p => {
      roundPoints[p.id] = p.tricksWon.reduce((a, c) => a + cardPoints(c), 0);
    });

    // Shooting the moon
    let shooterId = null;
    this.players.forEach(p => {
      const hearts = p.tricksWon.filter(c => suitOf(c) === "H").length;
      const hasQS = p.tricksWon.includes("QS");
      if (hearts === 13 && hasQS) shooterId = p.id;
    });

    if (shooterId) {
      const projected = {};
      this.players.forEach(p => (projected[p.id] = this.scores[p.id] || 0));
      this.players.forEach(p => { if (p.id !== shooterId) projected[p.id] += 26; });
      const wouldEnd = Object.values(projected).some(v => v >= 50);
      const shooterWouldWin = (projected[shooterId] <= Math.min(...this.players.filter(p => p.id !== shooterId).map(p => projected[p.id])));
      if (wouldEnd && !shooterWouldWin) {
        this.scores[shooterId] = (this.scores[shooterId] || 0) - 26;
      } else {
        this.players.forEach(p => { if (p.id !== shooterId) this.scores[p.id] = (this.scores[p.id] || 0) + 26; });
      }
    } else {
      this.players.forEach(p => {
        this.scores[p.id] = (this.scores[p.id] || 0) + roundPoints[p.id];
      });
    }

    this.finished = Object.values(this.scores).some(v => v >= 50);

    this.broadcastAll("roundEnd", { scores: this.scores, gameEnded: this.finished });

    if (this.finished) {
      this.started = false;
      io.emit("gameEnded", { scores: this.scores });
      return;
    }

    // new round
    this.players.forEach(p => (p.tricksWon = []));
    this.dealHands();
    this.firstTrick = true;
    this.heartsBroken = false;
    this.currentTrick = [];
    this.lastCompletedTrick = null;
    io.emit("lastTrick", null);
    this.broadcastAll("updateGame");
  }

  broadcastAll(event, extra) {
    for (const p of this.players) {
      const state = this.getStateFor(p.id);
      if (event === "updateGame") {
        p.socket.emit("updateGame", state);
      } else if (event === "lastTrick") {
        p.socket.emit("lastTrick", extra);
        p.socket.emit("updateGame", state);
      } else if (event === "roundEnd") {
        p.socket.emit("roundEnd", extra);
      }
    }
  }

  getStateFor(playerId) {
    const me = this.players.find(p => p.id === playerId);
    return {
      players: this.players.map(p => ({ id: p.id, name: p.name })),
      hand: me ? this.sortHand(me.hand.slice()) : [],
      scores: this.scores,
      currentTrick: this.currentTrick.slice(),
      lastCompletedTrick: this.lastCompletedTrick,
      turnPlayerId: this.getCurrentPlayer() ? this.getCurrentPlayer().id : null,
      heartsBroken: this.heartsBroken,
      firstTrick: this.firstTrick,
      finished: this.finished
    };
  }

  castRematchVote(playerId) {
    this.rematchVotes.add(playerId);
    io.emit("rematchStatus", { votes: Array.from(this.rematchVotes), needed: this.players.map(p => p.id) });
    if (this.players.length > 0 && this.rematchVotes.size === this.players.length) {
      this.startNewGame(true);
      for (const p of this.players) p.socket.emit("startGame", this.getStateFor(p.id));
      this.lastCompletedTrick = null;
      io.emit("lastTrick", null);
      this.rematchVotes.clear();
    }
  }

  /* ---- Typing indicator ---- */
  setTyping(playerId, isTyping) {
    if (isTyping) {
      this.typingMap.set(playerId, Date.now());
    } else {
      this.typingMap.delete(playerId);
    }
    this.broadcastTyping();
  }
  broadcastTyping() {
    const now = Date.now();
    for (const [pid, ts] of this.typingMap.entries()) {
      if (now - ts > 2500) this.typingMap.delete(pid);
    }
    const typingIds = Array.from(this.typingMap.keys());
    const typingNames = this.players.filter(p => typingIds.includes(p.id)).map(p => p.name);
    io.emit("typingUpdate", typingNames);
  }
}

const game = new Game();

/* ---- Chat helper ---- */
function fmtTime() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/* ---- Socket.IO ---- */
io.on("connection", (socket) => {
  socket.on("join", (name) => {
    if (!name || !name.trim()) { socket.emit("joinFailed", { reason: "Invalid name" }); return; }
    if (game.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      socket.emit("joinFailed", { reason: "Name already taken" }); return;
    }
    if (game.players.length >= 4) { socket.emit("joinFailed", { reason: "Game room is full" }); return; }

    if (!game.addPlayer(socket.id, name.trim(), socket)) {
      socket.emit("joinFailed", { reason: "Could not join" }); return;
    }

    socket.emit("joinSuccess", { playerId: socket.id, players: game.players.map(p => ({ id: p.id, name: p.name })) });
    io.emit("updatePlayers", { players: game.players.map(p => ({ id: p.id, name: p.name })) });

    if (game.allJoined()) {
      game.startNewGame(true);
      game.players.forEach(p => p.socket.emit("startGame", game.getStateFor(p.id)));

      // Auto-play 2C if first player has it (first trick)
      const firstP = game.getCurrentPlayer();
      if (firstP.hand.includes("2C")) {
        firstP.hand = firstP.hand.filter(c => c !== "2C");
        game.currentTrick.push({ playerId: firstP.id, card: "2C" });
        game.turnIndex = (game.turnIndex + 1) % game.players.length;
        game.broadcastAll("updateGame");
      }
    }
  });

  socket.on("playCard", (card) => {
    const res = game.playCard(socket.id, card);
    if (res.error) { socket.emit("playError", { reason: res.error }); return; }
    if (!res.animating) {
      game.players.forEach(p => p.socket.emit("updateGame", game.getStateFor(p.id)));
      if (game.lastCompletedTrick) io.emit("lastTrick", game.lastCompletedTrick);
      if (game.finished) io.emit("gameEnded", { scores: game.scores });
    }
  });

  socket.on("chatMessage", (text) => {
    const p = game.players.find(pp => pp.id === socket.id);
    if (!p) return;
    const t = (text || "").toString().slice(0, 300).trim();
    if (!t) return;
    io.emit("chat", { line: `[${fmtTime()} ${p.name}]: ${t}`, playerId: p.id });
  });

  socket.on("typing", (isTyping) => {
    game.setTyping(socket.id, !!isTyping);
  });

  socket.on("rematch", () => {
    if (!game.players.some(p => p.id === socket.id)) return;
    game.castRematchVote(socket.id);
  });

  socket.on("disconnect", () => {
    game.removePlayer(socket.id);
    io.emit("updatePlayers", { players: game.players.map(p => ({ id: p.id, name: p.name })) });
    game.rematchVotes.delete(socket.id);
  });
});

server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
