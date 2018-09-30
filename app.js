const express = require('express')
const path = require('path')
const bitcoinapi = require('bitcoin-node-api')
const favicon = require('static-favicon')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const settings = require('./lib/settings')
const routes = require('./routes/index')
const lib = require('./lib/explorer')
const db = require('./lib/database')
const locale = require('./lib/locale')

var app = express()

// bitcoinapi
bitcoinapi.setWalletDetails(settings.wallet)
if (!settings.heavy) {
  bitcoinapi.setAccess('only', ['getinfo', 'getnetworkcyclesps', 'getmininginfo', 'getdifficulty', 'getconnectioncount',
    'getblockcount', 'getblockhash', 'getblock', 'getrawtransaction', 'getpeerinfo', 'gettxoutsetinfo'])
} else {
  // enable additional heavy api calls
  /*
    getvote - Returns the current block reward vote setting.
    getmaxvote - Returns the maximum allowed vote for the current phase of voting.
    getphase - Returns the current voting phase ('Mint', 'Limit' or 'Sustain').
    getreward - Returns the current block reward, which has been decided democratically in the previous round of block reward voting.
    getnextrewardestimate - Returns an estimate for the next block reward based on the current state of decentralized voting.
    getnextrewardwhenstr - Returns string describing how long until the votes are tallied and the next block reward is computed.
    getnextrewardwhensec - Same as above, but returns integer seconds.
    getsupply - Returns the current money supply.
    getmaxmoney - Returns the maximum possible money supply.
  */
  bitcoinapi.setAccess('only', ['getinfo', 'getstakinginfo', 'getnetworkcyclesps', 'getdifficulty', 'getconnectioncount',
    'getblockcount', 'getblockhash', 'getblock', 'getrawtransaction', 'getmaxmoney', 'getvote',
    'getmaxvote', 'getphase', 'getreward', 'getnextrewardestimate', 'getnextrewardwhenstr',
    'getnextrewardwhensec', 'getsupply', 'gettxoutsetinfo'])
}
// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade')

app.use(favicon(path.join(__dirname, settings.favicon)))
app.use(logger('dev'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

// routes
app.use('/api', bitcoinapi.app)
app.use('/', routes)
app.use('/ext/getmoneysupply', function (req, res) {
  lib.get_supply(function (supply) {
    res.send(' ' + supply)
  })
})

app.use('/ext/getaddress/:hash', async function (req, res) {
  const address = await db.get_address(req.params.hash)
  if (address) {
    var a_ext = {
      address: address.a_id,
      sent: (address.sent / 100000000),
      received: (address.received / 100000000),
      balance: (address.balance / 100000000).toString().replace(/(^-+)/mg, ''),
      inviteSent: (address.inviteSent / 100000000),
      inviteReceived: (address.inviteReceived / 100000000),
      inviteBalance: (address.inviteBalance / 100000000),
      last_txs: address.txs
    }
    res.send(a_ext)
  } else {
    res.send({ error: 'address not found.', hash: req.params.hash })
  }
})

app.use('/ext/getbalance/:hash', async function (req, res) {
  const address = await db.get_address(req.params.hash)
  if (address) {
    res.send((address.balance / 100000000).toString().replace(/(^-+)/mg, ''))
  } else {
    res.send({ error: 'address not found.', hash: req.params.hash })
  }
})

app.use('/ext/getinvbalance/:hash', async function (req, res) {
  const address = await db.get_address(req.params.hash)
  if (address) {
    res.send(((address.inviteBalance / 100000000) - 1).toString().replace(/(^-+)/mg, ''))
  } else {
    res.send({ error: 'address not found.', hash: req.params.hash })
  }
})

app.use('/ext/getdistribution', async function (req, res) {
  try {
    const richlist = await db.get_richlist(settings.coin)
    const stats = await db.get_stats(settings.coin)
    const dist = await db.get_distribution(richlist, stats)
    res.send(dist)
  } catch (error) {
    console.error(error)
    res.sendStatus(500)
  }
})

app.use('/ext/getlasttxs/:min', async function (req, res) {
  const txs = await db.get_last_txs(settings.index.last_txs, (req.params.min * 100000000))
  res.send({ data: txs })
})

app.use('/ext/connections', async function (req, res) {
  const peers = await db.get_peers()
  res.send({ data: peers })
})

// locals
app.set('title', settings.title)
app.set('symbol', settings.symbol)
app.set('coin', settings.coin)
app.set('locale', locale)
app.set('display', settings.display)
app.set('markets', settings.markets)
app.set('twitter', settings.twitter)
app.set('facebook', settings.youtube)
app.set('googleplus', settings.googleplus)
app.set('youtube', settings.youtube)
app.set('genesis_block', settings.genesis_block)
app.set('index', settings.index)
app.set('heavy', settings.heavy)
app.set('txcount', settings.txcount)
app.set('nethash', settings.nethash)
app.set('nethash_units', settings.nethash_units)
app.set('show_sent_received', settings.show_sent_received)
app.set('logo', settings.logo)
app.set('theme', settings.theme)
app.set('labels', settings.labels)

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found')
    err.status = 404
    next(err)
})

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    res.status(err.status || 500)
        res.render('error', {
      message: err.message,
      error: err
    })
    })
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500)
    res.render('error', {
    message: err.message,
    error: {}
  })
})

module.exports = app
