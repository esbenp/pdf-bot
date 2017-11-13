var sinon = require('sinon')
var request = require('supertest')
var createApi = require('../src/api')
var error = require('../src/error')

describe('api: POST /', function () {
  var api
  beforeEach(function(){
    api = createApi(function(){}, {
      token: '1234'
    })
  })

  it('should return 401 if no token is given', function(done) {
    request(api)
      .post('/')
      .expect(401, done)
  })

  it('should return 401 if invalid token is give', function (done) {
    request(api)
      .post('/')
      .set('Authorization', 'Bearer test')
      .expect(401, done)
  })

  it('should return 422 on errorneous responses', function(done) {
    queue = function () {
      return {
        addToQueue: function() {
          return new Promise(function (resolve) {
            resolve({
              code: '001',
              error: true
            })
          })
        },
        close: function(){}
      }
    }
    var api = createApi(queue, {
      token: '1234'
    })

    request(api)
      .post('/')
      .set('Authorization', 'Bearer 1234')
      .send({})
      .expect(422, done)
  })

  it('should run the queue with the correct params', function (done) {
    var meta = {id: 1}

    var addToQueue = sinon.stub()
    addToQueue.onCall(0).returns(new Promise(function (resolve) { resolve({ id: '1234' }) }))

    var queue = function() {
      return {
        addToQueue: addToQueue,
        close: function(){}
      }
    }
    var api = createApi(queue, {
      token: '1234'
    })

    request(api)
      .post('/')
      .set('Authorization', 'Bearer 1234')
      .send({ url: 'https://google.com', meta: meta })
      .expect(201)
      .end(function (err, res) {
        if (err) return done(err)

        if (!addToQueue.calledWith({ url: 'https://google.com', meta: meta })) {
          throw new Error('Queue was not called with correct url')
        }

        done()
      })
  })
})
