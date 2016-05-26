var jsonist = require('jsonist')
var generateDocUrl = require('./generateDocUrl')

module.exports = function (config, cb) {
  var db_url = generateDocUrl(config.view, '')
  jsonist.get(db_url, (err, info) => {
    if (err) return cb(err)
    if (info && info.error === 'not_found') {
      return jsonist.put(db_url, {}, cb)
    }
    if (info.error) return cb(info.error)
    cb()
  })
}
