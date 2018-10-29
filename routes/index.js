const express = require('express')
const router = express.Router()
const settings = require('../lib/settings')
const locale = require('../lib/locale')
const db = require('../lib/database')
const lib = require('../lib/explorer')
const qr = require('qr-image')

async function route_get_block (res, blockhash) {
  const block = await lib.get_block(blockhash)
  if (block !== 'There was an error. Check your console.') {
    if (blockhash === settings.genesis_block) {
      res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: 'GENESIS' })
    } else {
      const txs = await db.get_txs(block)
      const invites = await db.get_invites(block)
      if (txs.length > 0) {
        res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: txs, invites: invites })
      } else {
        await db.create_txs(block)
        await db.create_invite_txs(block)
        const ntxs = await db.get_txs(block)
        const ninvs = await db.get_invites(block)
        if (ntxs.length > 0) {
          res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: ntxs, invites: ninvs })
        } else if (ninvs.length > 0) {
          res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: ntxs, invites: ninvs })
        } else {
          route_get_index(res, 'Block not found: ' + blockhash)
        }
      }
    }
  } else {
    route_get_index(res, 'Block not found: ' + blockhash)
  }
}

/* GET functions */

async function route_get_tx (res, txid) {
  if (txid === settings.genesis_tx) {
    route_get_block(res, settings.genesis_block)
  } else {
    const tx = await db.get_tx(txid)
    if (tx) {
      const blockcount = await lib.get_blockcount()
      res.render('tx', { active: 'tx', tx: tx, confirmations: settings.confirmations, blockcount: blockcount })
    } else {
      const rtx = await lib.get_rawtransaction(txid)
      if (rtx.txid) {
        let vin = lib.prepare_vin(rtx)
        let tmp = lib.prepare_vout(rtx.vout, rtx.txid, vin)
        let rvout = tmp.vout
        let rvin = tmp.vin
        
        const total = lib.calculate_total()
        
        if (!rtx.confirmations > 0) {
          var utx = {
            txid: rtx.txid,
            vin: rvin,
            vout: rvout,
            total: total.toFixed(8),
            timestamp: rtx.time,
            blockhash: '-',
            blockindex: -1
          }
          res.render('tx', { active: 'tx', tx: utx, confirmations: settings.confirmations, blockcount: -1 })
        } else {
          var utx = {
            txid: rtx.txid,
            vin: rvin,
            vout: rvout,
            total: total.toFixed(8),
            timestamp: rtx.time,
            blockhash: rtx.blockhash,
            blockindex: rtx.blockheight
          }
          const blockcount = await lib.get_blockcount()
          res.render('tx', { active: 'tx', tx: utx, confirmations: settings.confirmations, blockcount: blockcount })
        }
      } else {
        route_get_index(res, null)
      }
    }
  }
}

function route_get_index (res, error) {
  res.render('index', { active: 'home', error: error, warning: null })
}

async function route_get_address (res, hash, count) {
  const address = await db.get_address(hash)
  if (address) {
    const rank = await lib.get_addressrank(address.a_id)
    const txs = []
    const hashes = address.txs.reverse()
    if (address.txs.length < count) {
      count = address.txs.length
    }

    for (let i = 0; i < count; i++) {
      const tx = await db.get_tx(hashes[i].addresses)
      if (tx) {
        txs.push(tx)
      }
    }

    res.render('address', { active: 'address', address, txs , rank  })
  } else {
    route_get_index(res, hash + ' not found')
  }
}

/* GET home page. */
router.get('/', function (req, res) {
  route_get_index(res, null)
})

router.get('/info', function (req, res) {
  res.render('info', { active: 'info', address: settings.address, hashes: settings.api })
})

router.get('/markets/:market', async function (req, res) {
  var market = req.params.market
  if (settings.markets.enabled.indexOf(market) !== -1) {
    const data = await db.get_market(market)
    console.log(data)
    res.render('./markets/' + market, {
      active: 'markets',
      marketdata: {
        coin: settings.markets.coin,
        exchange: settings.markets.exchange,
        data: data
      },
      market: market
    })
  } else {
    route_get_index(res, null)
  }
})

router.get('/richlist', async function (req, res) {
  if (settings.display.richlist === true) {
    const stats = await db.get_stats(settings.coin)
    const richlist = await db.get_richlist(settings.coin)
    if (richlist) {
      const distribution = await db.get_distribution(richlist, stats)
      res.render('richlist', {
        active: 'richlist',
        balance: richlist.balance,
        received: richlist.received,
        inviteBalance: richlist.inviteBalance,
        stats: stats,
        dista: distribution.t_1_25,
        distb: distribution.t_26_50,
        distc: distribution.t_51_75,
        distd: distribution.t_76_100,
        diste: distribution.t_101plus,
        show_dist: settings.richlist.distribution,
        show_received: settings.richlist.received,
        show_balance: settings.richlist.balance
      })
    } else {
      route_get_index(res, null)
    }
  } else {
    route_get_index(res, null)
  }
})

router.get('/movement', function (req, res) {
  res.render('movement', { active: 'movement', flaga: settings.movement.low_flag, flagb: settings.movement.high_flag, min_amount: settings.movement.min_amount })
})

router.get('/network', function (req, res) {
  res.render('network', { active: 'network' })
})

router.get('/reward', async function (req, res) {
  res.send('Not implemented')
  // const heavy = await db.get_heavy(settings.coin)
  // var votes = heavy.votes
  // votes.sort(function (a, b) {
  //   if (a.count < b.count) {
  //     return -1
  //   } else if (a.count > b.count) {
  //     return 1
  //   } else {
  //     return 0
  //   }
  // })
  // res.render('reward', { active: 'reward', stats: stats, heavy: heavy, votes: heavy.votes })
})

router.get('/tx/:txid', function (req, res) {
  route_get_tx(res, req.params.txid)
})

router.get('/block/:hash', function (req, res) {
  route_get_block(res, req.params.hash)
})

router.get('/address/:hash', function (req, res) {
  route_get_address(res, req.params.hash, settings.txcount)
})

router.get('/address/:hash/:count', function (req, res) {
  route_get_address(res, req.params.hash, req.params.count)
})

router.post('/search', async function (req, res) {
  var query = req.body.search
  if (query.length === 64) {
    if (query === settings.genesis_tx) {
      return res.redirect('/block/' + settings.genesis_block)
    }
    const tx = await db.get_tx(query)
    if (tx) {
      return res.redirect('/tx/' + tx.txid)
    }
    const block = await lib.get_block(query)
    if (block) {
      return res.redirect('/block/' + query)
    }
    route_get_index(res, locale.ex_search_error + query + 'lol')
    return
  } 
  // Address
  const address = await db.get_address(query)
  if (address) {
    return res.redirect('/address/' + address.a_id)
  }
  // Hash
  const hash = await lib.get_blockhash(query)
  if (hash) {
    return res.redirect('/block/' + hash)
  }
  route_get_index(res, locale.ex_search_error + query)
})

router.get('/qr/:string', function (req, res) {
  if (req.params.string) {
    var address = qr.image(req.params.string, {
      type: 'png',
      size: 4,
      margin: 1,
      ec_level: 'M'
    })
    res.type('png')
    address.pipe(res)
  }
})

router.get('/ext/summary', async function (req, res) {
  let difficulty = await lib.get_difficulty()

  let difficultyHybrid = ''
  if (difficulty['proof-of-work']) {
    if (settings.index.difficulty === 'Hybrid') {
      difficultyHybrid = 'POS: ' + difficulty['proof-of-stake']
      difficulty = 'POW: ' + difficulty['proof-of-work']
    } else if (settings.index.difficulty === 'POW') {
      difficulty = difficulty['proof-of-work']
    } else {
      difficulty = difficulty['proof-of-stake']
    }
  }

  let hashrate = await lib.get_hashrate()
  const connections = await lib.get_connectioncount()
  const blockcount = await lib.get_blockcount()
  const stats = await db.get_stats(settings.coin)
  const lockedSupply = await lib.lockedSupply()

  if (hashrate === 'There was an error. Check your console.') {
    hashrate = 0
  }
  res.send({ data: [{
    difficulty: difficulty,
    difficultyHybrid: difficultyHybrid,
    supply: stats.supply,
    lockedSupply: lockedSupply,
    hashrate: hashrate,
    lastPrice: stats.last_price,
    connections: connections,
    blockcount: blockcount
  }] })
})

module.exports = router
