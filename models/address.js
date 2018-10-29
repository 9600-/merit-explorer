const mongoose = require('mongoose')
const Schema = mongoose.Schema

const AddressSchema = new Schema({
  a_id: { type: String, unique: true, index: true },
  txs: { type: Array, default: [] },
  received: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  inviteSent: { type: Number, default: 0 },
  inviteReceived: { type: Number, default: 0 },
  inviteBalance: { type: Number, default: 0 },
  alias: { type: String, default: '', index: true }
}, { id: false })

module.exports = mongoose.model('Address', AddressSchema)
