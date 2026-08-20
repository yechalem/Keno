const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 1. የውሂብ ማከማቻዎች (Databases)
const registeredUsers = {};      // { tgId: { id, name, balance, socketId } }
const bingoTakenNumbers = {};    // { number: tgId } -> ቢንጎ ላይ የተያዙ ቁጥሮች
let bingoDrawnNumbers = [];      // ቢንጎ ላይ የወጡ ቁጥሮች (ከ 1 እስከ 75)
let bingoTimer = 30;             // የቢንጎ 30 ሰከንድ ቆጣሪ

const activeKenoTickets = [];    // የኬኖ ቲኬቶች
let kenoDrawnNumbers = [];       // የኬኖ የወጡ ቁጥሮች
let kenoTimer = 60;              // የኬኖ ቆጣሪ

// --- የቢንጎ 30 ሰከንድ ቆጣሪ እና ራስ-ሰር ጥሪ (Auto-Caller) ---
setInterval(() => {
  bingoTimer--;
  if (bingoTimer <= 0) {
    bingoTimer = 30;
    bingoTakenNumbers = {}; // አዲስ ዙር ሲጀመር የተያዙ ቁጥሮችን ማጽዳት (ከተፈለገ)
    bingoDrawnNumbers = [];
    io.emit('bingoGameReset');
  }

  // በየ 30 ሰከንዱ አዲስ ቁጥር ማውጣት (ከ 1 እስከ 75)
  let nextNum;
  do {
    nextNum = Math.floor(Math.random() * 75) + 1;
  } while (bingoDrawnNumbers.includes(nextNum));

  bingoDrawnNumbers.push(nextNum);
  io.emit('bingoNewNumberCall', { number: nextNum, drawnList: bingoDrawnNumbers, timer: bingoTimer });
}, 30000);

// --- የኬኖ 60 ሰከንድ ቆጣሪ (የነበረው) ---
setInterval(() => {
  kenoTimer--;
  if (kenoTimer <= 0) {
    kenoTimer = 60;
    kenoDrawnNumbers = [];
    activeKenoTickets.length = 0;
    io.emit('kenoGameReset');
  }
  io.emit('kenoTimerUpdate', kenoTimer);
}, 1000);

io.on('connection', (socket) => {
  console.log('ተጫዋች ተገናኝቷል:', socket.id);

  // 📌 1. ተጠቃሚ በቴሌግራም ID እና በባላንሱ ሲመዘገብ
  socket.on('registerUser', (userData) => {
    if (!userData || !userData.id) return;
    const tgId = String(userData.id);

    if (!registeredUsers[tgId]) {
      registeredUsers[tgId] = {
        id: tgId,
        name: userData.first_name || "ተጫዋች",
        balance: userData.balance || 100.00, // የገባበት የብር መጠን ወይም ነባሪ
        socketId: socket.id
      };
    } else {
      registeredUsers[tgId].socketId = socket.id;
      if (userData.balance) {
        registeredUsers[tgId].balance = userData.balance;
      }
    }

    // መረጃውን ለተጠቃሚው መመለስ
    socket.emit('userData', {
      user: registeredUsers[tgId],
      bingoTakenNumbers: bingoTakenNumbers,
      bingoDrawnNumbers: bingoDrawnNumbers,
      kenoDrawnNumbers: kenoDrawnNumbers,
      activeKenoTickets: activeKenoTickets
    });
  });

  // 📌 2. ቢንጎ ላይ ተጠቃሚ ቁጥር ሲይዝ (ለምሳሌ 66) -> ለሁሉም ማሳየት
  socket.on('selectBingoNumber', (data) => {
    const { tgId, number } = data;
    const user = registeredUsers[String(tgId)];

    if (!user) {
      return socket.emit('errorMsg', 'እባክዎ መጀመሪያ ይመዝገቡ!');
    }

    // ቁጥሩ ቀድሞ የተያዘ መሆኑን ማረጋገጥ
    if (bingoTakenNumbers[number]) {
      return socket.emit('errorMsg', 'ይህ ቁጥር ቀድሞ ተይዟል!');
    }

    // ቁጥሩን በ ተጠቃሚው ID መመዝገብ
    bingoTakenNumbers[number] = String(tgId);

    // 🚀 ለሁሉም ተጫዋቾች ያ ቁጥር በማን እንደተያዘ በቅጽበት ማሳወቅ
    io.emit('bingoNumberTaken', {
      number: number,
      tgId: String(tgId),
      userName: user.name,
      takenNumbersMap: bingoTakenNumbers
    });
  });

  // 📌 3. ኬኖ ቲኬት መግዛት (ቀድሞ የነበረው)
  socket.on('buyTicket', (data) => {
    const user = registeredUsers[String(data.userId)];
    if (!user) return socket.emit('errorMsg', 'ተጠቃሚው አልተገኘም!');

    if (user.balance < data.bet) {
      return socket.emit('errorMsg', 'ባላንስዎ በቂ አይደለም!');
    }

    user.balance -= data.bet;
    socket.emit('balanceUpdated', user.balance);

    const newTicket = {
      userId: user.id,
      userName: user.name,
      numbers: data.numbers,
      bet: data.bet,
      maxWin: data.maxWin,
      hitsCount: 0
    };

    activeKenoTickets.push(newTicket);
    socket.emit('ticketBoughtSuccess');
    io.emit('updateActiveKenoTickets', activeKenoTickets);
  });

  socket.on('disconnect', () => {
    console.log('ተጫዋች ወጥቷል:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Keno & Bingo Live Server በፖርት ${PORT} ላይ እየሰራ ነው...`);
});
