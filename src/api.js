// these need to occur after dotenv
var express = require('express')
var bodyParser = require('body-parser')
var debug = require('debug')('pdf:api')
var error = require('./error')

function createApi(createQueue, options = {}) {
  var api = express()
  api.use(bodyParser.json())

  var token = options.token

  if (!token) {
    debug('Warning: The server should be protected using a token.')
  }

  api.post('/', function(req, res) {
    var queue = createQueue()
    var authHeader = req.get('Authorization')

    if (token && (!authHeader || authHeader.replace(/Bearer (.*)$/i, '$1') !== token)) {
      res.status(401).json(error.createErrorResponse(error.ERROR_INVALID_TOKEN))
      return
    }

    queue
      .addToQueue({
        url: req.body.url,
        meta: req.body.meta || {}
      }).then(function (response) {
        if (error.isError(response)) {
          res.status(422).json(response)
          return
        }

        res.status(201).json(response)
      })
  })

  return api
}

module.exports = createApi
