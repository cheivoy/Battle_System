const mongoose = require('mongoose');

const changeLogSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    userId: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true }
});

module.exports = mongoose.model('ChangeLog', changeLogSchema);