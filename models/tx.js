const mongoose = require('mongoose')
const Schema = mongoose.Schema

const TxSchema = new Schema({
  txid: { type: String, lowercase: true, unique: true, index: true },
  alias: { type: String, lowercase: true, default: '' },
  vin: { type: Array, default: [] },
  vout: { type: Array, default: [] },
  total: { type: Number, default: 0 },
  timestamp: { type: Number, default: 0 },
  blockhash: { type: String },
  blockindex: { type: Number, default: 0 },
  isInvite: { type: Boolean, default: false }
}, { id: false })

module.exports = mongoose.model('Tx', TxSchema)
