var url = require('url')

module.exports = function (view, id) {
  var parts = url.parse(view)
  var db = parts.pathname.split('/')[1]
  return url.resolve(view, '/' + db + '/' + id)
}
