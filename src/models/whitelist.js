const mongoose = require('mongoose');

const whitelistSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('Whitelist', whitelistSchema);