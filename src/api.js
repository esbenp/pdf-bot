// these need to occur after dotenv
var express = require('express')
var bodyParser = require('body-parser')
var debug = require('debug')('pdf:api')
var error = require('./error')
var queue = require('./queue')

function createApi(options = {}) {
  var api = express()
  api.use(bodyParser.json())

  var queueInstance = options.queue
  var queueOptions = options.queueOptions || {}
  var token = options.token

  if (!queueInstance) {
    queueInstance = queue.createQueue(queueOptions.path, queueOptions.lowDbOptions)
  }

  if (!token) {
    debug('Warning: The server should be protected using a token.')
  }

  api.post('/', function(req, res) {
    var authHeader = req.get('Authorization')

    if (token && (!authHeader || authHeader.replace(/Bearer (.*)$/, '$1') !== token)) {
      res.status(401).json(error.createErrorResponse(error.ERROR_INVALID_TOKEN))
      return
    }

    var response = queueInstance.addToQueue({
      url: req.body.url,
      meta: req.body.meta || {}
    })

    if (error.isError(response)) {
      res.status(422).json(response)
      return
    }

    res.status(201).json(response)
  })

  api.post('/hook', function (req, res) {
    var signature = req.get('X-PDF-Signature', 'sha1=')

    var bodyCrypted = require('crypto')
      .createHmac('sha1', '12345')
      .update(JSON.stringify(req.body))
      .digest('hex')

    if (bodyCrypted !== signature) {
      res.status(401).send()
      return
    }

    console.log('PDF webhook received', JSON.stringify(req.body))

    res.status(204).send()
  })

  return api
}

module.exports = createApi
