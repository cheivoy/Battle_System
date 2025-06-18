const mongoose = require('mongoose');

const pendingRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['job_change', 'id_change'], required: true },
    data: { type: Object, required: true }, // 儲存新職業或新遊戲 ID
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('PendingRequest', pendingRequestSchema);