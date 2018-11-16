var okConfig = require('./okConfig')
var generateDocUrl = require('./generateDocUrl')
var crypto = require('crypto')
var txn = require('txn')
var async = require('async')
var request = require('request')
var jsonfilter = require('jsonfilter')
var ndjson = require('ndjson')
var through = require('through2')
var devnull = require('dev-null')
var loader = require('./loadWorker')

exports.createWorker = function (worker) {
  return {
    start: exports.start.bind(null, worker)
  }
}

exports.start = function (worker, config, ready) {
  var ok = okConfig(config)
  if (ok.error) return new Error(ok)

  var bucket = config.bucket
  var w = loader.loadWorker(worker, config)
  var q = async.queue(exports.processor.bind(null, config, w), config.concurrency || 1)
  q.pause()
  var total = 0
  request(config.view)
    .on('response', function () { if (ready) ready(null, q) })
    .pipe(jsonfilter('rows.*'))
    .pipe(ndjson.parse())
    .on('end', () => {
      if (q.paused) q.resume()
    })
    .pipe(through.obj((data, enc, cb) => {
      if (!data.id) cb('no id on row')
      if (bucket && !exports.inBucket(bucket, data.id)) {
        console.log('ignoring', data.id, 'out of bucket')
        return cb()
      }
      console.log('queing', data.id)
      q.push(data.id)
      total++
      if (q.paused) q.resume()
      cb(null, {queued: true})
    }), function (cb) {
      if (q.paused) q.resume()
      console.log('total queued:', total)
      cb()
    })
    .pipe(ndjson.stringify())
    .pipe(devnull())
  return q
}

exports.processor = function (config, worker, id, cb) {
  var doc_url = generateDocUrl(config.view, id)
  console.log('processing', id, doc_url, worker)
  var opts = {
    uri: doc_url,
    timeout: config.timeout || 15000
  }
  txn(opts, worker.migrate, (err, doc) => {
    if (err) {
      console.log('there was an error migrating', id, err)
      return cb(err)
    }
    // verify the doc
    console.log('txn complete', id)
    if (worker.ignored(doc)) {
      console.log('doc now ignored.', id)
      return cb()
    }

    if (!worker.migrated(doc)) {
      console.log('txn completed, but worker migrated function still false', id)
      return cb('txn completed, but worker migrated function still false')
    }
    console.log('doc migrated successful', id)
    cb()
  })
}

exports.hash = function (str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

exports.inBucket = function (bucket, id) {
  var hash = exports.hash(id)
  console.log(hash)
  return (bucket.start ? hash >= bucket.start : true) &&
         (bucket.end ? hash < bucket.end : true);
}
