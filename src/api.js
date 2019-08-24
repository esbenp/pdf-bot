// these need to occur after dotenv
var express = require('express')
var bodyParser = require('body-parser')
var debug = require('debug')('pdf:api')
var error = require('./error')
var childProcess = require('child_process')

function createApi(inboundQueue, options = {}) {
  var api = express()
  api.use(bodyParser.json())

  var token = options.token

  if (!token) {
    debug('Warning: The server should be protected using a token.')
  }

  api.post('/', function(req, res) {
    var authHeader = req.get('Authorization')

    if (token && (!authHeader || authHeader.replace(/Bearer (.*)$/i, '$1') !== token)) {
      res.status(401).json(error.createErrorResponse(error.ERROR_INVALID_TOKEN))
      return
    }

    inboundQueue.add(
      {
        url: req.body.url,
        meta: req.body.meta || {},
        priority: req.body.priority
      },{
        priority: req.body.priority,
        attempts: 5
      }
    ).then(job => {
      res.status(204).json(null)
    }).catch(err => {
      res.status(422).json({ error: err.toString() })
    })
  })

  return api
}

module.exports = createApi
