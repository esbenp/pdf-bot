var debug = require('debug')('pdf:server')
var createApi = require('./api')

function createServer(options = {}) {
  var apiOptions = options.apiOptions || {}
  var port = options.port || 3000

  var generatorOptions = options.generatorOptions || {}
  apiOptions.generatorOptions = generatorOptions

  createApi(apiOptions).listen(port, function() {
    debug('Listening to port %d', port)
  })
}

module.exports = createServer
