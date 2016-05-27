#!/usr/bin/env node
var url = require('url')
var path = require('path')
var async = require('async')
var prompt = require('prompt')
var load = require('../lib/loadWorker')
var ensureDB = require('../lib/ensureDB')
var ensureDDoc = require('../lib/ensureDesignDoc')

if (process.argv.length < 4) {
  console.log('usage: simple-couchdb-view-processor config.js worker.js [init]')
  process.exit()
}

var worker = require(path.resolve('.', process.argv[3]))
var user_config = require(path.resolve('.', process.argv[2]))
if (typeof user_config === 'function') {
  user_config((err, loaded_config) => {
    if (err) {
      console.log('Error setting up config', err)
      process.exit(0)
    }
    user_config = loaded_config
    if (process.argv[4] === 'init') init()
    else processView()
  })
} else if (typeof user_config === 'object') {
  if (process.argv[4] === 'init') init()
  else processView()
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

function processView () {
  var q = require('../lib').createWorker(worker).start(user_config)
  setInterval(function () {
    var howMany = q.length()
    console.log(howMany, 'tasks left')
    if (q.length() === 0) {
      console.log('Exiting...')
      process.exit()
    }
  }, 1000)
}
