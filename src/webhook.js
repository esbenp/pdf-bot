var crypto = require('crypto')
var debug = require('debug')('pdf:webhook')
var fetch = require('node-fetch')
var uuid = require('uuid')
var error = require('./error')
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

    return getContentBody(response).then(body => {
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

function getContentBody (response) {
  return new Promise(function(resolve){
    var emptyCodes = [204, 205]
    if (emptyCodes.indexOf(response.status) !== -1) {
      resolve({})
    }

    // Happens for instance on ECONNREFUSED
    if (!(response instanceof fetch.Response)) {
      resolve(response)
    }

    var contentType = response.headers.get('content-type');
    if (contentType.indexOf('json') === -1) {
      return response.text().then(resolve)
    }

    return response.text().then(text => {
      if (!text) {
        return resolve({});
      }
      try {
        return resolve(JSON.parse(text))
      } catch (e) {
        return resolve(
          Object.assign(
            error.createErrorResponse(error.ERROR_INVALID_JSON_RESPONSE),
            {
              response: text
            }
          )
        )
      }
    })
  })
}
