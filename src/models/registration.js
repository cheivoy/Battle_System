const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RegistrationSchema = new Schema({
    battleId: { type: Schema.Types.ObjectId, ref: 'Battle', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isProxy: { type: Boolean, default: false },
    isBackup: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Registration', RegistrationSchema);
