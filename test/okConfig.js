var okConfig = require('../lib/okConfig')
var test = require('tape')

test('name and view required', t => {
  var ok = okConfig({})
  t.ok(ok.error)
  t.end()
})

test('name and view pass', t => {
  var ok = okConfig({name: 'test', view: 'http://localhost:5984/db/_design/worker:edm-gifimages/_view/not_migrated'})
  t.error(ok.error)
  t.end()
})
