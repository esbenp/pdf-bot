var crypto = require('crypto')
var debug = require('debug')('pdf:webhook')
var fetch = require('node-fetch')
var uuid = require('uuid')
var utils = require('./utils')

function ping (job, options) {
  if (!options.url || !utils.isValidUrl(options.url)) {
    throw new Error('Webhook is not valid url.')
  }

  if (!options.secret) {
    throw new Error('You need to supply a secret for your webhooks')
  }

  var requestOptions = options.requestOptions || {}

  var headerOptions = requestOptions.headers || {}

  requestOptions.method = 'POST'
  headerOptions['Content-Type'] = 'application/json'

  var bodyRaw = {
    id: job.id,
    url: job.url,
    meta: job.meta,
    storage: job.storage
  }
  var body = JSON.stringify(bodyRaw)

  var signature = generateSignature(body, options.secret)

  var requestId = uuid()
  var namespace = options.headerNamespace || 'X-PDF-'
  headerOptions[namespace + 'Transaction'] = requestId
  headerOptions[namespace + 'Signature'] = signature

  var headers = new fetch.Headers()
  for(var i in headerOptions) {
    headers.set(i, headerOptions[i])
  }

  requestOptions.headers = headers
  requestOptions.body = body

  debug(
    'Pinging job ID %s at URL %s with request options %s',
    job.id,
    options.url,
    JSON.stringify(requestOptions)
  )

  var sent_at = utils.getCurrentDateTimeAsString()

  function createResponse (response, error) {
    var status = response.status

    var createResponseObject = function(response, body) {
      return {
        id: requestId,
        status: response.status,
        method: requestOptions.method,
        payload: bodyRaw,
        response: body,
        url: options.url,
        sent_at: sent_at,
        error: !response.ok
      }
    }

    var emptyCodes = [204, 205]

    return error || emptyCodes.indexOf(response.status) !== -1
      ? new Promise(function (resolve) {
        return resolve(createResponseObject(response, error ? response : {}))
      })
      : response.json().then(function (json) {
        return createResponseObject(response, json)
      })
  }

  return fetch(options.url, requestOptions)
    .then(function (response) {
      return createResponse(response, !response.ok)
    })
    .catch(function (response) {
      return createResponse(response, true)
    })
}

module.exports = {
  generateSignature: generateSignature,
  ping: ping
}

function generateSignature (payload, key) {
  return crypto.createHmac('sha1', key).update(payload).digest('hex')
}
