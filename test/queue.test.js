var sinon = require('sinon')
var queue = require('../src/queue')
var utils = require('./utils')

describe('queue: addToQueue', function() {
  it('should fail given an invalid url', function() {
    var push = sinon.stub()
    var write = sinon.spy()

    push.onCall(0).returns({
      write: write
    })

    var response = queue.addToQueue({
      get: function() {
        return {
          push: push
        }
      }
    }, {
      url: 'noturl'
    })

    if (!response.error || response.code !== '002') {
      throw new Error('Invalid url error was not thrown.')
    }

    if (!write.notCalled) {
      throw new Error('Unintentional db write occurred.')
    }
  })

  it('should push the correct data to the database', function() {
    var push = sinon.stub()
    var write = sinon.spy()

    push.onCall(0).returns({
      write: write
    })

    var url = 'https://google.com'
    var meta = {id: 1}
    var response = queue.addToQueue({
      get: function() {
        return {
          push: push
        }
      }
    }, {
      id: '1',
      url: url,
      meta: meta
    })

    if (response.url !== url || response.meta !== meta || response.id === '1') {
      throw new Error('Job was not saved correctly.')
    }
  })
})

describe('queue: processJob', function() {
  it('should push the job to the generator', function(done) {
    var db = {markAsCompleted: sinon.spy()}
    var generator = sinon.stub()
    var promise = new Promise((resolve) => resolve({hello: true}))
    generator.onCall(0).returns(promise)

    var job = {id: 1, url: 'https://google.com'}
    var response = queue.processJob(db, generator, job)

    if (!generator.calledOnce || !generator.calledWith(job.url)) {
      throw new Error('The PDF generator was not called with the proper url.')
    }

    promise.then((response) => {
      if (!db.markAsCompleted.calledWith(1)) {
        throw new Error('Job was not completed.')
      }

      if (!response.hello) {
        throw new Error('Proper response was not returned')
      }

      done()
    })
  })
/*
  it('should bump retries when generator fails', function(done) {
    var db = {bumpRetries: sinon.spy()}
    var generator = sinon.stub()
    var promise = new Promise((resolve, reject) => reject('Not working'))
    generator.onCall(0).returns(promise)

    var job = {id: 1, url: 'https://google.com'}
    var response = queue.processJob(db, generator, job)

    promise.then((response) => {
      if (!db.bumpRetries.calledWith(1)) {
        throw new Error('Job was not completed.')
      }
    })
  })*/
})
