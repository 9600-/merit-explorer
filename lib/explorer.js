const bitcoin = require('bitcoin')
const settings = require('./settings')
const Address = require('../models/address')

const client = new bitcoin.Client(settings.wallet)
/**
 * bitcoin is deprecated, but instead of updating deps lets
 * hack it to use promises instead. /shrug
 */
const btc = function (name, ...args) {
  return new Promise((resolve, reject) => {
    client.cmd(name, ...args, function (err, result, resHeader) {
      if (err) reject(err)
      resolve(result)
    })
  })
}

// returns coinbase total sent as current coin supply
async function coinbaseSupply () {
  try {
    const address = await Address.findOne({ a_id: 'coinbase' })
    return address.sent
  } catch (error) {
    return 0
  }
}

async function lockedSupply () {
  try {
    const address = await Address.findOne({ a_id: 'ST2HYE5KMszAdBcGo3kw7Qsb9u1nRQhac4' })
    return address.balance / 100000000
  } catch (error) {
    return 0
  }
}

module.exports = {
  
  lockedSupply,

  syncLoop (...args) {
    console.error(new Error('NO NO NO! No sync loop!'))
  },

  convert_to_satoshi (amount) {
    // fix to 8dp & convert to string
    var fixed = amount.toFixed(8).toString()
    // remove decimal (.) and return integer
    return parseInt(fixed.replace('.', ''))
  },

  async get_hashrate () {
    if (settings.index.show_hashrate === false) return '-'
    if (settings.nethash === 'netmhashps') {
      const body = await btc('getmininginfo') // returned in mhash
      if (body.netmhashps) {
        switch (settings.nethash_units) {
          case 'K': return (body.netmhashps * 1000).toFixed(4)
          case 'G': return (body.netmhashps / 1000).toFixed(4)
          case 'H': return (body.netmhashps * 1000000).toFixed(4)
          case 'T': return (body.netmhashps / 1000000).toFixed(4)
          case 'P': return (body.netmhashps / 1000000000).toFixed(4)
          default: return body.netmhashps.toFixed(4)
        }
      } else {
        return '-'
      }
    } else {
      const body = await btc('getnetworkcyclesps')
      if (body === 'There was an error. Check your console.') {
        return '-'
      } else {
        switch (settings.nethash_units) {
          case 'K': return (body / 1000).toFixed(4)
          case 'M': return (body / 1000000).toFixed(4)
          case 'G': return (body / 1000000000).toFixed(4)
          case 'T': return (body / 1000000000000).toFixed(4)
          case 'P': return (body / 1000000000000000).toFixed(4)
          default: return body.toFixed(4)
        }
      }
    }
  },

  async get_difficulty () {
    try {
      return await btc('getdifficulty')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_addressrank (address) {
    try {
      return await btc('getaddressrank', address)
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_connectioncount () {
    try {
      return await btc('getconnectioncount')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_blockcount () {
    try {
      return await btc('getblockcount')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_blockhash (height) {
    try {
      return await btc('getblockhash', +height)
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_block (hash) {
    try {
      return await btc('getblock', hash)
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_rawtransaction (hash) {
    try {
      return await btc('getrawtransaction', hash, 1)
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_maxmoney () {
    try {
      return await btc('getmaxmoney')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_maxvote () {
    try {
      return await btc('getmaxvote')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_vote () {
    try {
      return await btc(getvote)
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_phase () {
    try {
      return await btc('getphase')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_reward () {
    try {
      return await btc('getreward')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_estnext () {
    try {
      return await btc('getnextrewardestimate')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_nextin () {
    try {
      return await btc('getnextrewardwhenstr')
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_peers () {
    try {
      return await btc('getpeerinfo')
    } catch (error) {
      console.log(error)
    }
  },

  /**
   * Find the aggregate supply of all wallets
   */
  async balance_supply () {
    try {
      const supply = await Address.aggregate({ $group: { _id: null, total: { $sum: '$balance' } } })
      return supply.total
    } catch (error) {
      console.log(error.stack)
    }
  },

  async get_supply () {
    let res
    let supply
    try {
      switch (settings.supply) {
        case 'HEAVY':
          return await btc('getsupply')
        case 'GETINFO':
          res = await btc('getinfo')
          return res.moneysupply
        case 'BALANCES':
          supply = await this.balance_supply()
          return supply / 100000000
        case 'TXOUTSET':
          res = await btc('gettxoutsetinfo')
          return res.total_amount
        default:
          supply = await coinbaseSupply()
          return supply / 100000000
      }
    } catch (error) {
      return '-'
    }
  },

  is_unique (array, object) {
    if (object == null) return -1
    return array.findIndex((item) => {
      return item.addresses === object[0]
    })
  },

  calculate_total (vout) {
    return vout.reduce((total, item) => {
      return total + item.amount
    }, 0)
  },

  /**
   * @param {Array} vout
   * @param {String} txid
   * @param {Array} vin
   */
  prepare_vout (vout, txid, vin) {
    const arrVout = []
    const arrVin = vin

    // Loop through vout
    for (const item of vout) {
      if (item.scriptPubKey.type === 'nonstandard' || item.scriptPubKey.type === 'nulldata') continue
      const index = this.is_unique(arrVout, item.scriptPubKey.addresses)
      const sats = this.convert_to_satoshi(parseFloat(item.value))
      if (index === -1) {
        arrVout.push({
          addresses: item.scriptPubKey.addresses,
          amount: sats,
          alias: item.scriptPubKey.aliases
        })
      } else {
        // already exists
        if (arrVout[index] != null) {
          arrVout[index].amount += sats
        }
      }
    }
    // If the first vout is nonstandard
    if (vout[0].scriptPubKey.type === 'nonstandard') {
      // and there is more than 1 input and output
      if (arrVin.length > 0 && arrVout.length > 0) {
        // And the input address matches the output address
        if (arrVin[0].addresses === arrVout[0].addresses) {
          // PoS
          arrVout[0].amount = arrVout[0].amount - arrVin[0].amount
          arrVin.shift()
        }
      }
    }
    return { vout: arrVout, vin: arrVin }
  },

  async get_input_addresses (input, vout) {
    const addresses = []
    if (input.coinbase) {
      const amount = vout.reduce((total, tx) => {
        return total + parseFloat(tx.value)
      }, 0)
      addresses.push({ alias: '', hash: 'coinbase', amount: amount })
      return addresses
    }
    // Not coinbase
    const tx = await this.get_rawtransaction(input.txid)
    if (tx && tx.vout != null) {
      for (const item of tx.vout) {
        if (item.n === input.vout) {
          if (item.scriptPubKey.addresses) {
            addresses.push({
              hash: item.scriptPubKey.addresses[0],
              amount: item.value,
              alias: item.scriptPubKey.aliases
            })
          }
          break
        }
      }
      return addresses
    }
  },

  async prepare_vin (tx) {
    var arrVin = []
    for (const item of tx.vin) {
      const addresses = await this.get_input_addresses(item, tx.vout)
      if (addresses && addresses.length) {
        const sats = this.convert_to_satoshi(parseFloat(addresses[0].amount))
        const index = this.is_unique(arrVin, addresses[0].hash)
        if (index === -1) {
          arrVin.push({
            alias: item.alias,
            addresses: addresses[0].hash,
            amount: sats
          })
        } else {
          arrVin[index].amount += sats
        }
      }
    }
    return arrVin
  }
}
