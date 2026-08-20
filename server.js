const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios'); // ከሰርቨራችን ጋር ለመነጋገር (npm install axios ያስፈልጋል)

// የቦት ቶከንዎን እዚህ ያስገቡ
const TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(TOKEN, { polling: true });

// የሰርቨርዎ ሊንክ (Render ላይ ያስቀመጡት የ Backend ሊንክ)
const SERVER_URL = 'https://bk-gbd9.onrender.com';

// /start ትዕዛዝ ሲላክ (የጠየቁትን ቅርጽ ሙሉ በሙሉ የጠበቀ)
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeText = "Welcome to your bot! Choose an option below.";

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎮 Play", web_app: { url: "https://tiny-dasik-98c906.netlify.app" } },
          { text: "👤 Register", callback_data: "register" }
        ],
        [
          { text: "💰 Check Balance", callback_data: "balance" },
          { text: "💸 Deposit", callback_data: "deposit" }
        ],
        [
          { text: "🚨 Contact support", url: "https://t.me/YOUR_ADMIN_USERNAME" },
          { text: "💬 Instruction", callback_data: "instruction" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, welcomeText, options);
});

// የአዝራሮቹ ምላሽ (Callback Queries)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === 'balance') {
    try {
      // ከሰርቨር ላይ የተጠቃሚውን ትክክለኛ ባላንስ ማምጣት
      const response = await axios.get(`${SERVER_URL}/api/user/${userId}`);
      const balance = response.data ? response.data.balance : 0.00;
      bot.sendMessage(chatId, `💰 የሒሳብዎ መጠን: ${balance.toFixed(2)} ETB`);
    } catch (error) {
      // ሰርቨር ላይ ካልተመዘገበ በነባሪ 0.00 ያሳያል
      bot.sendMessage(chatId, "💰 የሒሳብዎ መጠን: 0.00 ETB");
    }
  } else if (data === 'deposit') {
    bot.sendMessage(chatId, "📥 ገንዘብ ለማስገባት የሚከተለውን የቴሌብር ቁጥር ይጠቀሙ:\n\n**0915503379 (Mulualem Shewel)**\n\nከእጅ ወደ እጅ ካስተላለፉ በኋላ የቴሌብር SMS እዚህ አፕ ውስጥ በመለጠፍ ማረጋገጥ ይችላሉ።", { parse_mode: "Markdown" });
  } else if (data === 'register') {
    bot.sendMessage(chatId, "👤 ለመመዝገብ ከታች ያለውን ሊንክ በመጫን ዌብ አፑን ይክፈቱ። በዛ ሰዓት በራስ-ሰር ይመዝገባሉ!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 ጨዋታውን ጀምር (Register & Play)", web_app: { url: "https://tiny-dasik-98c906.netlify.app" } }]
        ]
      }
    });
  } else if (data === 'instruction') {
    bot.sendMessage(chatId, "💬 **የጨዋታው መመሪያ፦**\n1. ከ 1 እስከ 80 ያሉት ቁጥሮች ውስጥ የሚፈልጉትን (እስከ 10) ይምረጡ።\n2. የመደብ መጠንዎን ያስተካክሉ።\n3. 'መድብ (BUY)' የሚለውን በመጫን ቲኬትዎን ይቁረጡ።\n4. ቆጣሪው ሲያልቅ ቁጥሮች ይወጣሉ፣ የነኩት ቁጥር ከወጣ ያሸንፋሉ!");
  }

  // የአዝራሩን መጫን ማረጋገጫ (Loading እንዲቆም)
  bot.answerCallbackQuery(query.id);
});
