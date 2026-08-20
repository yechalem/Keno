const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// የዩዘር ዳታቤስ ስኪማ (Schema)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: String,
    wallet: { type: Number, default: 500 }, // ነባሪ ባላንስ 500 ብር
    history: [{ type: Object }]
});
const User = mongoose.model('User', UserSchema);

let takenCards = []; // የቢንጎ የተያዙ ካርዶች

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // ዩዘር ሲገባ ቴሌግራም ID በመፈለግ ማዘጋጀት ወይም መፍጠር
    socket.on('join_game', async ({ telegramId }) => {
        try {
            let user = await User.findOne({ telegramId });
            if (!user) {
                user = await User.create({ telegramId, wallet: 500, history: [] });
            }
            socket.emit('init_user_data', user);
            socket.emit('update_taken_cards', takenCards);
        } catch (err) {
            console.error('Error joining game:', err);
        }
    });

    // የኬኖ ጨዋታ ውጤት ሲመዘገብ (ክፍያ እና ባላንስ ማስተካከል)
    socket.on('play_keno', async ({ telegramId, betAmount, winAmount }) => {
        try {
            let user = await User.findOne({ telegramId });
            if (!user || user.wallet < betAmount) {
                return socket.emit('error_msg', 'በቂ ባላንስ የለዎትም!');
            }

            let netChange = winAmount - betAmount;
            user.wallet += netChange;
            user.history.unshift({ 
                game: 'KENO', 
                bet: betAmount, 
                won: winAmount, 
                net: netChange, 
                date: new Date() 
            });

            await user.save();
            socket.emit('wallet_updated', user.wallet);
        } catch (err) {
            console.error('Error on keno game:', err);
        }
    });

    // የቢንጎ ካርድ ሲመረጥ እና ጨዋታ ሲጀመር
    socket.on('select_card_and_start', async ({ telegramId, cardId, betAmount }) => {
        try {
            let user = await User.findOne({ telegramId });
            if (!user || user.wallet < betAmount) {
                return socket.emit('error_msg', 'በቂ ባላንስ የለዎትም!');
            }

            user.wallet -= betAmount;
            user.history.unshift({ game: 'BINGO_BET', amount: -betAmount, date: new Date() });
            await user.save();

            if (!takenCards.includes(cardId)) {
                takenCards.push(cardId);
            }

            io.emit('update_taken_cards', takenCards);
            socket.emit('wallet_updated', user.wallet);
        } catch (err) {
            console.error('Error starting bingo:', err);
        }
    });

    // የቢንጎ አሸናፊ ሲኖር
    socket.on('player_bingo', async ({ telegramId, winAmount }) => {
        try {
            let user = await User.findOne({ telegramId });
            if (user) {
                user.wallet += winAmount;
                user.history.unshift({ game: 'BINGO_WIN', amount: winAmount, date: new Date() });
                await user.save();
                socket.emit('wallet_updated', user.wallet);
            }

            io.emit('game_over_winner', { telegramId, winAmount });
            takenCards = []; // አዲስ ዙር ሲጀመር የያዙትን ማጽዳት
        } catch (err) {
            console.error('Error on bingo win:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/keno_bingo_db';

mongoose.connect(MONGO_URI)
    .then(() => {
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => console.log('Database connection error:', err));
