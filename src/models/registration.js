const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
    battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isProxy: { type: Boolean, default: false },
    isBackup: { type: Boolean, default: false }
});

module.exports = mongoose.model('Registration', registrationSchema);