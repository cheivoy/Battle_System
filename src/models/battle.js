const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BattleSchema = new Schema({
    battleDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'published', 'confirmed', 'closed'], default: 'pending' },
    formation: {
        groupA: [{ squadName: String, job: String, gameId: String }],
        groupB: [{ squadName: String, job: String, gameId: String }]
    },
    createdAt: { type: Date, default: Date.now }
}, { strictPopulate: false });

module.exports = mongoose.model('Battle', BattleSchema);
