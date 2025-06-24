const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BattleSchema = new Schema({
    battleDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'published', 'confirmed'], default: 'pending' },
    formation: {
        groupA: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        groupB: [{ type: Schema.Types.ObjectId, ref: 'User' }]
    },
    createdAt: { type: Date, default: Date.now }
}, { strictPopulate: false });

module.exports = mongoose.model('Battle', BattleSchema);
