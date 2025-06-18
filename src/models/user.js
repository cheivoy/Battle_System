const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: String,
    discriminator: String,
    gameId: String,
    job: String,
    isAdmin: { type: Boolean, default: false },
    isWhitelisted: { type: Boolean, default: false } // 新增：是否在白名單
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);