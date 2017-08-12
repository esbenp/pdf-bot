var sinon = require('sinon')
var proxyquire = require('proxyquire')
var fetch = require('node-fetch')

var job = {
  id: 1,
  url: 'http://localhost',
  meta: {
    id: 1
  },
  storage: {
    local: 'something.pdf'
  }
}

describe('webhook', function() {
  var options = {
    secret: '1234',
    url: 'http://localhost/hook'
  }
  var fetchStub, promise, webhook

  beforeEach(function() {
    promise = new Promise(resolve => resolve({}))
    fetchStub = sinon.stub().returns(promise)
    webhook = proxyquire('../src/webhook', {
      'node-fetch': fetchStub
    })
  })

  it('should throw error if no valid url is given', function() {
    var didThrow = false
    try {
      webhook.ping({}, { url: 'hello' })
    } catch (e) {
      didThrow = true
    }

    if (!didThrow) {
      throw new Error('Did not throw on invalid URL')
    }
  })

  it('should throw if no secret is given', function() {
    var didThrow = false
    try {
      webhook.ping({}, { url: 'http://localhost' })
    } catch (e) {
      didThrow = true
    }

    if (!didThrow) {
      throw new Error('Did not throw on no secret')
    }
  })

  it('should add passed request options to the request', function() {
    options.headerNamespace = 'X-Tests-'
    options.requestOptions = {
      headers: {
        'X-Something': 'hello'
      },
      method: 'GET'
    }

    webhook.ping(job, options)

    var fetchOptions = fetchStub.args[0][1]
    var headers = fetchOptions.headers.raw()

    if (
      headers['content-type'][0] !== 'application/json' ||
      !headers['x-tests-transaction'][0] ||
      !headers['x-tests-signature'][0] ||
      headers['x-something'][0] !== 'hello'
    ) {
      console.log(headers)
      throw new Error('Headers were not set correctly.')
    }

    if (fetchOptions.method !== 'POST') {
      throw new Error('Mehod was not POST.')
    }

    if (fetchOptions.body !== JSON.stringify(job)) {
      throw new Error('Body was not correct.')
    }
  })

  it('should return empty response for 204 and 205', function(done) {
    var json = sinon.spy()
    fetchStub.returns(
      new Promise(function(resolve) {
        return resolve({
          json: json,
          status: 204
        })
      })
    )

    webhook.ping(job, options).then(function(response) {
      if (!json.notCalled) {
        throw new Error('json was called')
      }

      done()
    })
  })

  it('should be marked as error on bad response', function(done) {
    fetchStub.returns(
      new Promise(function(resolve) {
        return resolve({
          status: 422
        })
      })
    )

    webhook.ping(job, options).then(function(response) {
      if (!response.error) {
        throw new Error('it was not marked as error')
      }

      done()
    })
  })

  it('should return proper response on success', function (done) {
    fetchStub.returns(
      new Promise(function (resolve) {
        resolve(new fetch.Response(JSON.stringify('response'), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }))
      })
    )

    webhook.ping(job, options).then(function (response) {
      if (response.id !== fetchStub.args[0][1].headers.raw()['x-tests-transaction'][0] ||
        response.method !== 'POST' ||
        response.response !== 'response' ||
        response.status !== 200) {
          console.log(response)
          throw new Error('Invalid response')
      }

      done()
    })
  })

  it('should generate proper HMAC signature', function() {
    var key = '12345'
    var body = 'awesome pdf generator'
    var signature = webhook.generateSignature(body, key)

    if (signature !== '6ff42a71ad26f83b76ea41defa22fb520716ddfb') {
      throw new Error('Generated signature was not correct')
    }
  })
})
