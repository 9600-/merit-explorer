const mongoose = require('mongoose')
const Stats = require('../models/stats')
const Markets = require('../models/markets')
const Address = require('../models/address')
const Tx = require('../models/tx')
const Richlist = require('../models/richlist')
const Peers = require('../models/peers')
const Heavy = require('../models/heavy')
const lib = require('./explorer')
const settings = require('./settings')
const poloniex = require('./markets/poloniex')
const bittrex = require('./markets/bittrex')
const bleutrade = require('./markets/bleutrade')
const cryptsy = require('./markets/cryptsy')
const cryptopia = require('./markets/cryptopia')
const yobit = require('./markets/yobit')
const empoex = require('./markets/empoex')
const ccex = require('./markets/ccex')

mongoose.Promise = Promise

async function find_address (hash) {
  try {
    return await Address.findOne({ $or: [{ a_id: hash }, { alias: hash }] })
  } catch (error) {
    console.log(error.stack)
  }
}

async function find_richlist (coin) {
  try {
    return await Richlist.findOne({ coin: coin })
  } catch (error) {
    console.log(error.stack)
  }
}

async function update_address (hash, alias, txid, amount, inviteAmount, type) {
  try {
    const address = await find_address(hash)

    if (address) {
      if (hash === 'coinbase') {
        // if coinbase (new coins PoW), update sent only and return.
        return await Address.update({ a_id: hash }, {
          sent: address.sent + amount,
          inviteSent: address.inviteSent + inviteAmount,
          balance: 0,
          inviteBalance: 0
        })
      } else {
        // ensure tx doesnt already exist in address.txs
        const index = lib.is_unique(address.txs, txid)
        const tx_array = address.txs
        let received = address.received
        let sent = address.sent
        let inviteSent = address.inviteSent
        let inviteReceived = address.inviteReceived

        if (type === 'vin') {
          inviteSent += inviteAmount
          sent = sent + amount
        } else { // vout
          inviteReceived += inviteAmount
          received += amount
        }

        if (index === -1) {
          tx_array.push({ addresses: txid, type: type })
          if (tx_array.length > settings.txcount) {
            tx_array.shift()
          }
          return await Address.update({ a_id: hash }, {
            alias,
            txs: tx_array,
            received,
            sent,
            balance: received - sent,
            inviteSent,
            inviteReceived,
            inviteBalance: inviteReceived - inviteSent
          })
        } else {
          if (type === tx_array[index].type) {
            // duplicate
          } else {
            return await Address.update({ a_id: hash }, {
              alias,
              txs: tx_array,
              received: received,
              sent: sent,
              balance: received - sent,
              inviteSent: inviteSent,
              inviteReceived: inviteReceived,
              inviteBalance: inviteReceived - inviteSent
            })
          }
        }
      }
    } else {
      let newAddress
      if (type === 'vin') {
        newAddress = new Address({
          alias: alias,
          a_id: hash,
          txs: [ { addresses: txid, type: 'vin' } ],
          sent: amount,
          balance: amount,
          inviteSent: inviteAmount,
          inviteBalance: inviteAmount
        })
      } else {
        newAddress = new Address({
          alias: alias,
          a_id: hash,
          txs: [ { addresses: txid, type: 'vout' } ],
          received: amount,
          balance: amount,
          inviteReceived: inviteAmount,
          inviteBalance: inviteAmount
        })
      }
      await newAddress.save()
      // console.log('address saved: %s', hash)
    }
  } catch (error) {
    console.error(error.stack)
  }
}

async function find_tx (txid) {
  try {
    return await Tx.findOne({ txid: txid })
  } catch (error) {
    console.error(error.stack)
    return null
  }
}

async function save_tx (txid, isInvite) {
  const tx = await lib.get_rawtransaction(txid)
  if (tx === 'There was an error. Check your console.') {
    return 'tx not found: ' + txid
  }
  const block = await lib.get_block(tx.blockhash)
  if (block) {
    // TODO: Vin passed to prepare vout
    let vin = await lib.prepare_vin(tx)
    let tmp = lib.prepare_vout(tx.vout, txid, vin)
    let vout = tmp.vout
    vin = tmp.vin

    // loop vin
    for (const item of vin) {
      if (isInvite) {
        await update_address(item.addresses, item.alias, txid, 0, item.amount, 'vin')
      } else {
        await update_address(item.addresses, item.alias, txid, item.amount, 0, 'vin')
      }
    }

    // loop vout
    for (const item of vout) {
      if (item.addresses) {
        if (isInvite) {
          await update_address(item.addresses, item.alias, txid, 0, item.amount, 'vout')
        } else {
          await update_address(item.addresses, item.alias, txid, item.amount, 0, 'vout')
        }
      }
    }

    const total = lib.calculate_total(vout)
    const newTx = new Tx({
      txid: tx.txid,
      vin: vin,
      vout: vout,
      total: total.toFixed(8),
      timestamp: tx.time,
      blockhash: tx.blockhash,
      blockindex: block.height,
      isInvite
    })

    await newTx.save()
  } else {
    return 'block not found: ' + tx.blockhash
  }
}

function get_market_data (market, cb) {
  switch (market) {
    case 'bittrex':
      bittrex.get_data(settings.markets.coin, settings.markets.exchange, function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'bleutrade':
      bleutrade.get_data(settings.markets.coin, settings.markets.exchange, function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'poloniex':
      poloniex.get_data(settings.markets.coin, settings.markets.exchange, function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'cryptsy':
      cryptsy.get_data(settings.markets.coin, settings.markets.exchange, settings.markets.cryptsy_id, function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'cryptopia':
      cryptopia.get_data(settings.markets.coin, settings.markets.exchange, settings.markets.cryptopia_id, function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'ccex':
      ccex.get_data(settings.markets.coin.toLowerCase(), settings.markets.exchange.toLowerCase(), settings.markets.ccex_key, function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'yobit':
      yobit.get_data(settings.markets.coin.toLowerCase(), settings.markets.exchange.toLowerCase(), function (err, obj) {
        return cb(err, obj)
      })
      break
    case 'empoex':
      empoex.get_data(settings.markets.coin, settings.markets.exchange, function (err, obj) {
        return cb(err, obj)
      })
      break
    default:
      return cb(null)
  }
}

module.exports = {
  // initialize DB
  async connect (database) {
    try {
      await mongoose.connect(database)
    } catch (err) {
      if (err) {
        console.log('Unable to connect to database: %s', database)
        console.log('Aborting')
        process.exit(1)
      }
    }
  },

  async check_stats (coin) {
    try {
      const stats = await Stats.findOne({ coin: coin })
      return !!(stats)
    } catch (error) {}
  },

  async get_stats (coin) {
    try {
      const stats = await Stats.findOne({ coin: coin })
      if (stats) return stats
      return null
    } catch (error) {
      return null
    }
  },

  async create_stats (coin) {
    const newStats = new Stats({ coin })
    try {
      await newStats.save()
      console.log('initial stats entry created for %s', coin)
    } catch (error) {
      console.error(error)
    }
  },

  async get_address (hash) {
    try {
      return await find_address(hash)
    } catch (error) {
      console.error(error.stack)
    }
  },

  async get_richlist (coin) {
    try {
      return await find_richlist(coin)
    } catch (error) {
      console.error(error.stack)
    }
  },
  // property: 'received' or 'balance', 'invites'
  async update_richlist (list) {
    if (list === 'received') {
      const addresses = await Address.find({}).select('-txs').sort({ received: 'desc' }).limit(100).exec()
      await Richlist.update({ coin: settings.coin }, { received: addresses })
    } else if (list === 'balance') { // balance
      const addresses = await Address.find({}).select('-txs').sort({ balance: 'desc' }).limit(100).exec()
      await Richlist.update({ coin: settings.coin }, { balance: addresses })
    } else {
      const addresses = await Address.find({}).select('-txs').sort({ inviteBalance: 'desc' }).limit(100).exec()
      await Richlist.update({ coin: settings.coin }, { inviteBalance: addresses })
    }
  },

  async get_tx (txid) {
    try {
      return await find_tx(txid)
    } catch (error) {
      console.error(error.stack)
    }
  },

  async get_txs (block) {
    var txs = []

    if (block && block.tx && block.tx.length) {
      for (const txid of block.tx) {
        const tx = await find_tx(txid)
        if (tx) {
          txs.push(tx)
        }
      }
    }
    return txs
  },

  async get_invites (block) {
    var invites = []

    if (block && block.invites && block.invites.length) {
      for (const inviteid of block.invites) {
        const invite = await find_tx(inviteid)
        if (invite) {
          invites.push(invite)
        }
      }
    }
    return invites
  },

  async create_tx (txid) {
    try {
      return await save_tx(txid, false)
    } catch (e) {
      return e
    }
  },

  async create_invite_tx (txid) {
    try {
      return await save_tx(txid, true)
    } catch (e) {
      return e
    }
  },

  // TODO Fix me
  async create_txs (block) {
    if (block && block.tx && block.tx.length) {
      for (const item of block.tx) {
        await save_tx(item, false)
      }
    }
  },

  async create_invite_txs (block) {
    if (block && block.invites && block.invites.length) {
      for (const item of block.invites) {
        await save_tx(item, true)
      }
    }
  },

  async get_last_txs (count, min) {
    try {
      return await Tx.find({ 'total': { $gt: min } }).sort({ _id: 'desc' }).limit(count).exec()
    } catch (err) {
      return err
    }
  },

  async create_market (coin, exchange, market) {
    const newMarkets = new Markets({
      market: market,
      coin: coin,
      exchange: exchange
    })

    try {
      await newMarkets.save()
      console.log('initial markets entry created for %s', market)
    } catch (err) {
      console.log(err)
    }
  },

  // checks market data exists for given market
  async check_market (market) {
    try {
      const exists = await Markets.findOne({ market: market })
      return !!exists
    } catch (error) {}
  },

  // gets market data for given market
  async get_market (market) {
    try {
      market = Markets.findOne({ market })
      if (market) return market
      return null
    } catch (error) {
      console.error(error.stack)
    }
  },

  // creates initial richlist entry in database; called on first launch of explorer
  async create_richlist (coin) {
    const newRichlist = new Richlist({ coin })
    await newRichlist.save()
    console.log('initial richlist entry created for %s', coin)
  },

  // checks richlist data exists for given coin
  async check_richlist (coin) {
    const isThere = await Richlist.findOne({ coin: coin })
    return !!isThere
  },

  create_heavy: function (coin, cb) {
    var newHeavy = new Heavy({
      coin: coin
    })
    newHeavy.save(function (err) {
      if (err) {
        console.log(err)
        return cb()
      } else {
        console.log('initial heavy entry created for %s', coin)
        console.log(newHeavy)
        return cb()
      }
    })
  },

  check_heavy: function (coin, cb) {
    Heavy.findOne({ coin: coin }, function (err, exists) {
      if (exists) {
        return cb(true)
      } else {
        return cb(false)
      }
    })
  },

  get_heavy: function (coin, cb) {
    Heavy.findOne({ coin: coin }, function (err, heavy) {
      if (heavy) {
        return cb(heavy)
      } else {
        return cb(null)
      }
    })
  },
  get_distribution: function (richlist, stats, cb) {
    const distribution = {
      supply: stats.supply,
      t_1_25: { percent: 0, total: 0 },
      t_26_50: { percent: 0, total: 0 },
      t_51_75: { percent: 0, total: 0 },
      t_76_100: { percent: 0, total: 0 },
      t_101plus: { percent: 0, total: 0 }
    }
    let count = 0
    for (const balance in richlist.balance) {
      count++
      const percentage = ((balance / 100000000) / stats.supply) * 100
      if (count <= 25) {
        distribution.t_1_25.percent = distribution.t_1_25.percent + percentage
        distribution.t_1_25.total = distribution.t_1_25.total + (balance / 100000000)
      }
      if (count <= 50 && count > 25) {
        distribution.t_26_50.percent = distribution.t_26_50.percent + percentage
        distribution.t_26_50.total = distribution.t_26_50.total + (balance / 100000000)
      }
      if (count <= 75 && count > 50) {
        distribution.t_51_75.percent = distribution.t_51_75.percent + percentage
        distribution.t_51_75.total = distribution.t_51_75.total + (balance / 100000000)
      }
      if (count <= 100 && count > 75) {
        distribution.t_76_100.percent = distribution.t_76_100.percent + percentage
        distribution.t_76_100.total = distribution.t_76_100.total + (balance / 100000000)
      }
    }
    distribution.t_101plus.percent = parseFloat(100 - distribution.t_76_100.percent - distribution.t_51_75.percent - distribution.t_26_50.percent - distribution.t_1_25.percent).toFixed(2)
    distribution.t_101plus.total = parseFloat(distribution.supply - distribution.t_76_100.total - distribution.t_51_75.total - distribution.t_26_50.total - distribution.t_1_25.total).toFixed(8)
    distribution.t_1_25.percent = parseFloat(distribution.t_1_25.percent).toFixed(2)
    distribution.t_1_25.total = parseFloat(distribution.t_1_25.total).toFixed(8)
    distribution.t_26_50.percent = parseFloat(distribution.t_26_50.percent).toFixed(2)
    distribution.t_26_50.total = parseFloat(distribution.t_26_50.total).toFixed(8)
    distribution.t_51_75.percent = parseFloat(distribution.t_51_75.percent).toFixed(2)
    distribution.t_51_75.total = parseFloat(distribution.t_51_75.total).toFixed(8)
    distribution.t_76_100.percent = parseFloat(distribution.t_76_100.percent).toFixed(2)
    distribution.t_76_100.total = parseFloat(distribution.t_76_100.total).toFixed(8)
    return distribution
  },
  // updates heavy stats for coin
  // height: current block height, count: amount of votes to store
  update_heavy: function (coin, height, count, cb) {
    var newVotes = []
    lib.get_maxmoney(function (maxmoney) {
      lib.get_maxvote(function (maxvote) {
        lib.get_vote(function (vote) {
          lib.get_phase(function (phase) {
            lib.get_reward(function (reward) {
              lib.get_supply(function (supply) {
                lib.get_estnext(function (estnext) {
                  lib.get_nextin(function (nextin) {
                    lib.syncLoop(count, function (loop) {
                      var i = loop.iteration()
                      lib.get_blockhash(height - i, function (hash) {
                        lib.get_block(hash, function (block) {
                          newVotes.push({ count: height - i, reward: block.reward, vote: block.vote })
                          loop.next()
                        })
                      })
                    }, function () {
                      console.log(newVotes)
                      Heavy.update({ coin: coin }, {
                        lvote: vote,
                        reward: reward,
                        supply: supply,
                        cap: maxmoney,
                        estnext: estnext,
                        phase: phase,
                        maxvote: maxvote,
                        nextin: nextin,
                        votes: newVotes
                      }, function () {
                        // console.log('address updated: %s', hash);
                        return cb()
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  },

  // updates market data for given market; called by sync.js
  update_markets_db: function (market, cb) {
    get_market_data(market, function (err, obj) {
      if (err == null) {
        Markets.update({ market: market }, {
          chartdata: JSON.stringify(obj.chartdata),
          buys: obj.buys,
          sells: obj.sells,
          history: obj.trades,
          summary: obj.stats
        }, function () {
          if (market === settings.markets.default) {
            Stats.update({ coin: settings.coin }, {
              last_price: obj.stats.last
            }, function () {
              return cb(null)
            })
          } else {
            return cb(null)
          }
        })
      } else {
        return cb(err)
      }
    })
  },

  // updates stats data for given coin; called by sync.js
  async update_db (coin) {
    try {
      const count = await lib.get_blockcount()
      if (!count) {
        console.log('Unable to connect to explorer API')
        return
      }
      const supply = await lib.get_supply()
      const connections = await lib.get_connectioncount()
      await Stats.update({ coin: coin }, {
        coin: coin,
        count: count,
        supply: supply,
        connections: connections
      })
    } catch (error) {
      console.error(error.stack)
    }
  },

  // updates tx, address & richlist db's; called by sync.js
  async update_tx_db (coin, start, end) {
    let count = end - start + 1
    let lastBlock = start
    let i = 0
    const timer = setInterval(() => {	
	console.log('%s :: Last block: %s, %s b/s', new Date(), start + i, (start + i - lastBlock) / 10)
	lastBlock = start + i
    }, 10000)
    const syncArray = Array(count) // So we can use for loop

    for (const _ of syncArray) {
      i++
      if (i % 500 === 0) {
        await Tx.find({})
          .where('blockindex')
          .lt(start + i)
          .sort({ timestamp: 'desc' })
          .limit(settings.index.last_txs)
          .exec()
        await Stats.update({ coin: coin }, { last: start + i - 1 })
      }
      const blockhash = await lib.get_blockhash(start + i)
      if (blockhash) {
        const block = await lib.get_block(blockhash)
        if (block) {
          // MRT
          for (const txid of block.tx) {
            const tx = await Tx.findOne({ txid })
            if (!tx) {
              try {
                await save_tx(txid, false)
                // console.log('%s: %s merit', block.height, txid)
              } catch (error) {
                console.error(error)
              }
            }
          }
          // Invites
          for (const txid of block.invites) {
            const tx = await Tx.findOne({ txid })
            if (!tx) {
              try {
                await save_tx(txid, true)
                // console.log('%s: %s invite', block.height, txid)
              } catch (error) {
                console.error(error)
              }
            }
          }
        } else {
          console.error('block not found: %s', blockhash)
        }
      }
    }
    clearInterval(timer)
    await Tx.find({}).sort({ timestamp: 'desc' }).limit(settings.index.last_txs).exec()
    await Stats.update({ coin }, { last: end })
  },

  async create_peer (params) {
    try {
      const newPeer = new Peers(params)
      return await newPeer.save()
    } catch (err) {
      console.log(err)
    }
  },

  async find_peer (address) {
    try {
      const peer = await Peers.findOne({ address: address })
      return peer || null
    } catch (err) {
      return null
    }
  },

  async get_peers () {
    try {
      return await Peers.find({})
    } catch (err) {
      return []
    }
  }
}
