const mongoose = require('mongoose');

const changeLogSchema = new mongoose.Schema({
    userId: String,
    type: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChangeLog', changeLogSchema);