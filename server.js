const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 1. የተመዘገቡ ተጫዋቾችን መያዣ (In-memory storage)
// { "tg_user_id": { id: "...", name: "...", balance: 100, socketId: "..." } }
const registeredUsers = {};

// 2. ተጫዋቾች የያዟቸውን የቢንጎ ቁጥሮች/ካርዶች መያዣ
// { "tg_user_id": { numbers: [5, 12, 23, ...], bet: 20 } }
const playerSelections = {};

io.on('connection', (socket) => {
  console.log('አዲስ ግንኙነት:', socket.id);

  // 📌 1. ተጫዋች በ Telegram ID ሲመዘገብ ወይም ሲገባ
  socket.on('registerUser', (userData) => {
    if (!userData || !userData.id) return;

    const tgId = String(userData.id);

    // ተጫዋቹ ቀደም ሲል ካልተመዘገበ በአዲስ መዝግብ
    if (!registeredUsers[tgId]) {
      registeredUsers[tgId] = {
        id: tgId,
        name: userData.first_name || "ተጫዋች",
        balance: 100.00, // የመጀመሪያ ቦነስ/ባላንስ
        socketId: socket.id
      };
    } else {
      // ተመልሶ ከገባ Socket ID ውን ብቻ አድስ
      registeredUsers[tgId].socketId = socket.id;
    }

    // ለገባው ተጫዋች የራሱን መረጃ እና አሁን በጨዋታው ያሉትን የተያዙ ቁጥሮች ላክለት
    socket.emit('userData', {
      user: registeredUsers[tgId],
      allSelections: playerSelections
    });

    // አጠቃላይ የመጡ ተጫዋቾችን ብዛት ለሁሉም አስተላልፍ (Broadcast)
    io.emit('updateLiveStats', {
      totalPlayersCount: Object.keys(registeredUsers).length
    });
  });

  // 📌 2. ተጫዋቹ የቢንጎ ቁጥር/ካርድ ሲይዝ (ቁጥር ሲመርጥ)
  socket.on('selectBingoNumber', (data) => {
    // data = { userId: "12345678", selectedNumbers: [12, 45, 60] }
    const tgId = String(data.userId);

    if (!registeredUsers[tgId]) {
      return socket.emit('errorMsg', 'እባክዎ መጀመሪያ ይመዝገቡ!');
    }

    // የተጫዋቹን መረጃ እና የመረጣቸውን ቁጥሮች መዝግቦ መያዝ
    playerSelections[tgId] = {
      userId: tgId,
      userName: registeredUsers[tgId].name,
      numbers: data.selectedNumbers,
      bet: data.bet || 10
    };

    // 🚀 ለሁሉም ተጫዋቾች (ALL USERS) የትኛው ተጫዋች የትኞቹን ቁጥሮች እንደያዘ በቅጽበት ማሳወቅ
    io.emit('allPlayerSelectionsUpdated', {
      updatedUserId: tgId,
      allSelections: playerSelections
    });
  });

  // 📌 3. ተጫዋች ሲወጣ (Disconnect)
  socket.on('disconnect', () => {
    console.log('ተጫዋች ወጥቷል:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bingo Live Server በፖርት ${PORT} ላይ እየሰራ ነው...`);
});
