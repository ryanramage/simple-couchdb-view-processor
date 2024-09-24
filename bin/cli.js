#!/usr/bin/env node
var url = require('url')
var path = require('path')
var async = require('async')
var config = require('rc')('simplecouchdbviewprocessor', {})
var prompt = require('prompt')
var exeunt = require('exeunt')
var getPort = require('get-port')
var bucket = require('swarm-bucket')
var swarm = require('discovery-swarm')
var load = require('../lib/loadWorker')
var ensureDB = require('../lib/ensureDB')
var ensureDDoc = require('../lib/ensureDesignDoc')


let configPath = config._[0]
let workerPath = config._[1]

if (!configPath || !workerPath) {
  console.log('usage: ')
  console.log('  init the view: simple-couchdb-view-processor config.js worker.js init')
  console.log('  run simple   : simple-couchdb-view-processor config.js worker.js')
  console.log('  run cluster  : simple-couchdb-view-processor config.js worker.js --cluster=someclusterid')
  process.exit()
}


// do the setup all tasks need
var worker = require(path.resolve('.', workerPath))
var user_config = require(path.resolve('.', configPath))
if (typeof user_config === 'function') {
  user_config((err, loaded_config) => {
    if (err) {
      console.log('Error setting up config', err)
      process.exit(0)
    }
    user_config = loaded_config
    if (process.argv[4] === 'init') init()
    else start()
  })
} else if (typeof user_config === 'object') {
  if (process.argv[4] === 'init') init()
  else start()
}

var creds = null
var do_prompt = false

function init () {
  async.retry(initLoop.bind(null, user_config, creds), (err) => {
    if (err) return console.log('Error:', err)
    console.log('Ok')
  })
}

function initLoop (user_config, creds, cb, fromBefore) {
  var afterCreds = () => {
    ensureDB(user_config, (err, info) => {
      if (info && info.error === 'unauthorized') {
        do_prompt = true
        return cb('unauthorized')
      }
      if (err || (info && info.error)) return cb(err)
      var w = load.loadWorker(worker, user_config)
      ensureDDoc(user_config, w, (err, result) => {
        if (result && result.error === 'unauthorized') {
          do_prompt = true
          return cb('unauthorized')
        }
        if (err || (result && result.error)) return cb(err)
        cb()
      })
    })
  }

  if (!do_prompt) return afterCreds()

  if (fromBefore) {
    console.log(fromBefore)
  }
  prompt.start()
  prompt.get(['username', 'password'], (err, result) => {
    if (err) console.log(err)
    var _url = url.parse(user_config.view)
    creds = {
      username: result.username,
      password: result.password
    }
    _url.auth = creds.username + ':' + creds.password
    user_config.view = url.format(_url)
    do_prompt = false
    afterCreds()
  })
}

function start () {
  if (!config.cluster) return processView()
  if (config.port) return clusterMode(config.port, config.cluster)
  getPort().then(port => clusterMode(port, config.cluster))
}

let sw = null
let _q = null
let _interval = null

function clusterMode (port, swarmId) {
  console.log('starting cluster mode', port, swarmId)
  sw = swarm()
  sw.listen(port)
  sw.join(swarmId)
  const b = bucket(sw)
  b.on('change', function (responsibility) {
    if (_interval) clearInterval(_interval)
    if (_q) _q.kill()
    if (responsibility.length === 1) return console.log('just do vanila')
    user_config.bucket = responsibility.range
    processView()
  })
  // processView()
}

function processView () {
  require('../lib').createWorker(worker).start(user_config, (err, q) => {
    if (err) {
      console.log(err)
      process.exit(1)
    }
    _q = q
    var howMany = 0
    _interval = setInterval(function () {
      if (q.paused) return
      var running = q.running()
      if (howMany !== q.length()) {
        console.log(q.length(), 'tasks left, ', running, 'running tasks')
      }
      howMany = q.length()
      if (q.length() === 0 && running === 0) {
        console.log('Exiting...')
        clearInterval(_interval)
        q.kill()
        exeunt(0)
      }
    }, 1000)
  })
  process.on('SIGINT', () => {
    console.log('Received SIGINT. Exiting')
    if (_interval) clearInterval(_interval)
    if (_q) _q.kill()
    if (sw) sw.leave(config.cluster)
    process.exit()
  })
}

process.on('uncaughtException', (err, origin) => {
  console.log('Caught exception:', err, 'Exception origin:', origin)
})

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason)
})

