const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// የቴሌግራም ቦት መረጃዎች (የራስዎን ያስገቡ)
const TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN_HERE";
const ADMIN_CHAT_ID = "YOUR_ADMIN_CHAT_ID_HERE";

// ዳታቤዝ (ለጊዜው በ Memory ላይ የተያዘ Shared Balance)
// Keno እና Bingo ይሄንን አንድ ዳታ ይጠቀማሉ
const usersDb = {}; 

// የቢንጎ ጨዋታ ሩም ሁኔታ
let bingoRoom = {
    takenCards: [], // የተያዙ ካርዶች ዝርዝር
    playersCount: 0,
    activePlayers: {} // ተጫዋቾች እና የመረጡት ካርድ
};

// ለቴሌግራም አድሚን ሜሴጅ መላኪያ
async function sendToTelegramAdmin(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: ADMIN_CHAT_ID,
            text: message,
            parse_mode: "HTML"
        });
    } catch (error) {
        console.error("Telegram notification error:", error.message);
    }
}

io.on("connection", (socket) => {
    console.log("New user connected:", socket.id);

    // 1. ተጠቃሚ ሲመዘገብ (የጋራ ባላንሱን ማሳየት)
    socket.on("registerUser", (userData) => {
        const userId = userData.id;
        socket.userId = userId;

        // ተጠቃሚው ከሌለ አዲስ መፍጠር (ከ 0.00 ባላንስ ጋር)
        if (!usersDb[userId]) {
            usersDb[userId] = { 
                id: userId, 
                first_name: userData.first_name, 
                balance: 0.00 
            };
        }

        // ለተጠቃሚው የራሱን ባላንስ መላክ
        socket.emit("userData", { user: usersDb[userId] });
        
        // አሁን ያለውን የቢንጎ ሩም ሁኔታ ለገባው ሰው ብቻ መላክ
        socket.emit("roomState", {
            takenCards: bingoRoom.takenCards,
            playersCount: bingoRoom.playersCount
        });
    });

    // 2. ተጠቃሚ ካርድ ሲመርጥ (ሌሎች ጋር ቀይ እንዲሆን መላክ)
    socket.on("selectCard", (data) => {
        const { userId, cardId, bet } = data;
        const user = usersDb[userId];

        if (!user) return socket.emit("infoMsg", "ተጠቃሚው አልተገኘም!");

        // ካርዱ በሌላ ሰው ከተያዘ መከልከል
        if (bingoRoom.takenCards.includes(String(cardId))) {
            return socket.emit("infoMsg", "ይህ ካርድ ቀድሞ ተይዟል!");
        }

        // ባላንስ ማረጋገጥ እና መቀነስ
        if (user.balance < bet) {
            return socket.emit("infoMsg", "በቂ ባላንስ የለዎትም!");
        }
        
        user.balance -= bet; 
        bingoRoom.takenCards.push(String(cardId));
        bingoRoom.activePlayers[userId] = cardId;
        bingoRoom.playersCount = Object.keys(bingoRoom.activePlayers).length;

        // ለባለቤቱ አዲሱን ባላንስ መላክ
        socket.emit("balanceUpdated", user.balance);

        // ለሁሉም ተጫዋቾች ካርዱ መያዙን በ Real-time ማሳወቅ (በሁሉም ስልክ ቀይ ይሆናል)
        io.emit("cardTaken", { cardId: cardId });
        io.emit("updatePlayers", bingoRoom.playersCount);
    });

    // 3. የገቢ (Deposit) ጥያቄ
    socket.on("verifyAndDeposit", (data) => {
        const { userId, amount, smsText } = data;
        const user = usersDb[userId];
        
        const adminMsg = `📥 <b>አዲስ የገቢ ጥያቄ</b>\n\n👤 ስም: ${user?.first_name || 'Unkown'}\n🆔 መታወቂያ: <code>${userId}</code>\n💰 መጠን: <b>${amount} ETB</b>\n📝 SMS:\n${smsText}`;
        sendToTelegramAdmin(adminMsg);
        
        socket.emit("infoMsg", "የገቢ ጥያቄዎ ለአድሚን ተልኳል። ሲረጋገጥ ባላንስዎ ይስተካከላል!");
    });

    // 4. የወጪ (Withdraw) ጥያቄ
    socket.on("requestWithdraw", (data) => {
        const { userId, amount, accountDetails } = data;
        const user = usersDb[userId];

        if (!user || user.balance < amount) {
            return socket.emit("infoMsg", "በቂ ባላንስ የለዎትም!");
        }

        // ገንዘቡን ከባላንስ ላይ መቀነስ (Pending ሁኔታ)
        user.balance -= amount;
        socket.emit("balanceUpdated", user.balance);

        const adminMsg = `📤 <b>አዲስ የወጪ ጥያቄ</b>\n\n👤 ስም: ${user.first_name}\n🆔 መታወቂያ: <code>${userId}</code>\n💰 መጠን: <b>${amount} ETB</b>\n💳 አካውንት: ${accountDetails}`;
        sendToTelegramAdmin(adminMsg);

        socket.emit("infoMsg", "የወጪ ጥያቄዎ ተቀባይነት አግኝቷል። በቅርቡ ወደ አካውንትዎ ይገባል!");
    });

    // ተጠቃሚው ሲወጣ
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// Admin ገንዘብ ሲያጸድቅ (Webhook ወይም Admin Panel ተጠቅመው የሚጠሩት Endpoint)
app.post("/admin/approve-deposit", (req, res) => {
    const { userId, amount } = req.body;
    
    if (usersDb[userId]) {
        usersDb[userId].balance += parseFloat(amount);
        
        // ለተጠቃሚው አዲሱን ባላንስ በ Real-time መላክ (ለ Bingo ሆነ Keno)
        io.emit("balanceUpdated", usersDb[userId].balance);
        res.json({ success: true, newBalance: usersDb[userId].balance });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// ሰርቨሩን ማስጀመር
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
