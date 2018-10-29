const mongoose = require('mongoose')
const Schema = mongoose.Schema

const RichlistSchema = new Schema({
  coin: { type: String },
  received: { type: Array, default: [] },
  balance: { type: Array, default: [] },
  inviteBalance: { type: Array, default: [] },
})

module.exports = mongoose.model('Richlist', RichlistSchema)
