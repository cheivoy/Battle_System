const mongoose = require('mongoose');

const battleSchema = new mongoose.Schema({
    battleDate: { type: Date, required: true },
    deadline: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'published', 'confirmed'], default: 'pending' },
    formation: {
        groupA: [{ squadName: String, job: String, gameId: String }],
        groupB: [{ squadName: String, job: String, gameId: String }]
    }
});

module.exports = mongoose.model('Battle', battleSchema);