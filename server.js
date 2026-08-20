const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// የቴሌግራም ቦት መረጃዎች (የራስዎን TOKEN እና ADMIN CHAT ID ያስገቡ)
const BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const ADMIN_CHAT_ID = "YOUR_ADMIN_CHAT_ID_HERE"; 
const WEB_APP_URL = "https://tiny-dasik-98c906.netlify.app";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Shared Database (በ Keno፣ Bingo እና Telegram Bot በጋራ የሚያገለግል)
const usersDb = {}; 

// የቢንጎ ጨዋታ ሩም ሁኔታ
let bingoRoom = {
    takenCards: [],
    playersCount: 0,
    activePlayers: {}
};

// ==========================================
// 1. TELEGRAM BOT LOGIC
// ==========================================

// /start ትዕዛዝ ሲላክ
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const firstName = msg.from.first_name || "Player";

    // ተጠቃሚውን በ Shared Database ውስጥ መመዝገብ
    if (!usersDb[userId]) {
        usersDb[userId] = { id: userId, first_name: firstName, balance: 0.00 };
    }

    const welcomeText = `እንኳን ወደ ጨዋታችን በደህና መጡ ${firstName}! የሚፈልጉትን አማራጭ ይምረጡ።`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🎮 Play Game", web_app: { url: WEB_APP_URL } },
                    { text: "👤 Profile", callback_data: "profile" }
                ],
                [
                    { text: "💰 Check Balance", callback_data: "balance" },
                    { text: "💸 Deposit", callback_data: "deposit" }
                ],
                [
                    { text: "📤 Withdraw", callback_data: "withdraw" },
                    { text: "💬 Instruction", callback_data: "instruction" }
                ],
                [
                    { text: "🚨 Contact Support", url: "https://t.me/YOUR_ADMIN_USERNAME" }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, welcomeText, options);
});

// የአዝራሮቹ ምላሽ (Callback Queries)
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);
    const data = query.data;

    // ተጠቃሚው በዳታቤዝ ውስጥ መኖሩን ማረጋገጥ
    if (!usersDb[userId]) {
        usersDb[userId] = { id: userId, first_name: query.from.first_name || "Player", balance: 0.00 };
    }

    const userBalance = usersDb[userId].balance.toFixed(2);

    if (data === "balance") {
        bot.sendMessage(chatId, `💰 **የሕሳብዎ መጠን (Balance):** ${userBalance} ETB`);
    } else if (data === "deposit") {
        bot.sendMessage(chatId, `📥 **ገንዘብ ማስገቢያ (Deposit):**\n\nበቴሌብር ወደ **0915503379 (Mulualem)** ብር ያስገቡ።\nከዚያም በ Web App ውስጥ ገብተው የላኩበትን መጠን እና SMS ያስገቡ።`);
    } else if (data === "withdraw") {
        bot.sendMessage(chatId, `📤 **ገንዘብ ማውጫ (Withdraw):**\n\nበ Web App ውስጥ በመግባት የወጪ ማድረጊያ ጥያቄ ማቅረብ ይችላሉ።\nአሁን ያለዎት ባላንስ: **${userBalance} ETB**`);
    } else if (data === "profile") {
        bot.sendMessage(chatId, `👤 **የመገለጫ መረጃ:**\n\nስም: ${query.from.first_name}\nID: \`${userId}\` \nባላንስ: ${userBalance} ETB`, { parse_mode: "Markdown" });
    } else if (data === "instruction") {
        bot.sendMessage(chatId, "💬 **የጨዋታው መመሪያ፦**\n1. Web App ውስጥ ገብተው Bingo ወይም Keno ይምረጡ\n2. የካርድ ቁጥር ይምረጡ (የመረጡት ካርድ ለሌሎች ቀይ ሆኖ ይዘጋል)\n3. ጨዋታው ሲጀምር Bingo/Keno በማድረግ ያሸንፉ!");
    }

    bot.answerCallbackQuery(query.id);
});

// ==========================================
// 2. SOCKET.IO REAL-TIME LOGIC (WEB APP)
// ==========================================

io.on("connection", (socket) => {
    console.log("Web App client connected:", socket.id);

    // ተጠቃሚ ከ WebApp ሲገናኝ
    socket.on("registerUser", (userData) => {
        const userId = String(userData.id);
        socket.userId = userId;

        if (!usersDb[userId]) {
            usersDb[userId] = { 
                id: userId, 
                first_name: userData.first_name || "Player", 
                balance: 0.00 
            };
        }

        // አሁናዊ ባላንስ መላክ
        socket.emit("userData", { user: usersDb[userId] });

        // የቢንጎ ሩም ወቅታዊ ሁኔታ መላክ
        socket.emit("roomState", {
            takenCards: bingoRoom.takenCards,
            playersCount: bingoRoom.playersCount
        });
    });

    // ተጠቃሚ ካርድ ሲመርጥ (ለሌሎች በ Real-time ቀይ ሆኖ እንዲታይ የሚያደርግ)
    socket.on("selectCard", (data) => {
        const { userId, cardId, bet } = data;
        const uId = String(userId);
        const user = usersDb[uId];

        if (!user) return socket.emit("infoMsg", "ተጠቃሚው አልተገኘም!");

        // ካርዱ ቀድሞ ከተያዘ መከልከል
        if (bingoRoom.takenCards.includes(String(cardId))) {
            return socket.emit("infoMsg", "ይህ ካርድ በሌላ ተጫዋች ተይዟል!");
        }

        // ባላንስ ማረጋገጥ
        if (user.balance < bet) {
            return socket.emit("infoMsg", "በቂ ባላንስ የለዎትም!");
        }

        // ባላንስ መቀነስ እና ካርዱን መያዝ
        user.balance -= bet;
        bingoRoom.takenCards.push(String(cardId));
        bingoRoom.activePlayers[uId] = cardId;
        bingoRoom.playersCount = Object.keys(bingoRoom.activePlayers).length;

        // ለተጠቃሚው አዲሱን ባላንስ ማሳወቅ
        socket.emit("balanceUpdated", user.balance);

        // ለሁሉም ተጫዋቾች ካርዱ መያዙን በ Real-time ማሰራጨት (የሌሎች ስክሪን ላይ ቀይ ይሆናል)
        io.emit("cardTaken", { cardId: cardId });
        io.emit("updatePlayers", bingoRoom.playersCount);
    });

    // Web App ላይ Deposit ሲደረግ ለ Admin በ Telegram መልእክት ይልካል
    socket.on("verifyAndDeposit", (data) => {
        const { userId, amount, smsText } = data;
        const uId = String(userId);
        const user = usersDb[uId];

        const adminMsg = `📥 <b>አዲስ የገቢ (Deposit) ጥያቄ</b>\n\n👤 <b>ስም:</b> ${user?.first_name || 'Unkown'}\n🆔 <b>ID:</b> <code>${uId}</code>\n💰 <b>መጠን:</b> ${amount} ETB\n📱 <b>SMS መልእክት:</b>\n<code>${smsText}</code>`;

        bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: "HTML" });
        socket.emit("infoMsg", "የገቢ ጥያቄዎ ለአድሚን ተልኳል። ሲረጋገጥ ባላንስዎ ይስተካከላል!");
    });

    // Web App ላይ Withdraw ሲደረግ ለ Admin በ Telegram መልእክት ይልካል
    socket.on("requestWithdraw", (data) => {
        const { userId, amount, accountDetails } = data;
        const uId = String(userId);
        const user = usersDb[uId];

        if (!user || user.balance < parseFloat(amount)) {
            return socket.emit("infoMsg", "በቂ ባላንስ የለዎትም!");
        }

        // ባላንስ መቀነስ (Pending)
        user.balance -= parseFloat(amount);
        socket.emit("balanceUpdated", user.balance);

        const adminMsg = `📤 <b>አዲስ የወጪ (Withdraw) ጥያቄ</b>\n\n👤 <b>ስም:</b> ${user.first_name}\n🆔 <b>ID:</b> <code>${uId}</code>\n💰 <b>መጠን:</b> ${amount} ETB\n💳 <b>አካውንት:</b> ${accountDetails}`;

        bot.sendMessage(ADMIN_CHAT_ID, adminMsg, { parse_mode: "HTML" });
        socket.emit("infoMsg", "የወጪ ጥያቄዎ ተልኳል፤ በቅርቡ ገቢ ይደረጋል!");
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

// ==========================================
// 3. ADMIN API (ለገንዘብ ማጽደቂያ)
// ==========================================

// አድሚን የገቢ ጥያቄ ሲያጸድቅ ባላንስ መጨመሪያ
app.post("/admin/approve-deposit", (req, res) => {
    const { userId, amount } = req.body;
    const uId = String(userId);

    if (usersDb[uId]) {
        usersDb[uId].balance += parseFloat(amount);

        // ለተጠቃሚው ቦት ላይ ማሳወቂያ መላክ
        bot.sendMessage(uId, `✅ <b>የገቢ ጥያቄዎ ጸድቋል!</b>\n\n💰 የተጨመረ: ${amount} ETB\n💳 አሁናዊ ባላንስ: ${usersDb[uId].balance.toFixed(2)} ETB`, { parse_mode: "HTML" });

        // WebApp ላይ ካለ ባላንሱን በ Real-time ማዘመን
        io.emit("balanceUpdated", usersDb[uId].balance);

        res.json({ success: true, newBalance: usersDb[uId].balance });
    } else {
        res.status(404).json({ error: "User not found" });
    }
});

// ሰርቨሩን ማስጀመር
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server & Telegram Bot running on port ${PORT}`);
});
