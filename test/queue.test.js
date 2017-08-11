var assert = require('assert')
var fs = require('fs')
var path = require('path')
var sinon = require('sinon')
var baseCreateQueue = require('../src/queue')
var error = require('../src/error')
var webhook = require('../src/webhook')

var queuePath = path.join(__dirname, 'db.json')

function getQueue() {
  return JSON.parse(fs.readFileSync(queuePath, 'utf8')).queue
}

function deleteQueue() {
  fs.unlinkSync(queuePath)
}

function createQueue() {
  // Some times we want to create the queue in the test
  if (fs.existsSync(queuePath)) {
    deleteQueue()
  }
  return baseCreateQueue.apply(this, [queuePath].concat([].slice.call(arguments)))
}

var i = 0
function createJob(completed = false, tries = 0) {
  i++
  return {
    id: i,
    completed_at: (completed ? '2017-01-01' : null),
    generatorTries: completed ? 1 : tries,
    pings: [],
    pingTries: 0
  }
}

describe('queue : retrieval', function() {
  var queue
  beforeEach(function() {
    i = 0
    queue = createQueue()
  })

  it('should create a default structure', function() {
    var queue = getQueue()
    assert(Array.isArray(queue))
  })

  it('should create error when passing invalid url', function() {
    var response = queue.addToQueue({
      url: '$#$#@%@#'
    })

    assert(response.error)
    assert.equal(response.code, error.getErrorCode(error.ERROR_INVALID_URL))
  })

  it('should create error when passing invalid meta', function() {
    var response = queue.addToQueue({
      meta: 'not-object',
      url: 'http://localhost'
    })

    assert(response.error)
    assert.equal(response.code, error.getErrorCode(error.ERROR_META_IS_NOT_OBJECT))
  })

  it('should save jobs to the queue', function() {
    queue.addToQueue({
      meta: {
        hello: true
      },
      url: 'http://localhost'
    })

    var job = getQueue()[0]

    assert.equal(job.meta.hello, true)
    assert.equal(job.url, 'http://localhost')
  })

  it('should return failed jobs when failed flag is passed', function(){
    queue = createQueue({}, [
      createJob(false, 2),
      createJob(true, 1),
      createJob(false, -1) // has not been run yet
    ])

    var list = queue.getList(true)

    assert.equal(list.length, 1)
    assert.equal(list[0].id, 1)
  })

  it('should return completed jobs', function() {
    queue = createQueue({}, [
      createJob(true),
      createJob(true),
      createJob(false)
    ])

    var list = queue.getList(false, false)

    assert.equal(list.length, 2)
    assert.equal(list[1].id, 2)
  })

  it('should return new jobs', function() {
    queue = createQueue({}, [
      createJob(true),
      createJob(true),
      createJob(false, 1), // failed
      createJob(false, -1) // new
    ])

    var list = queue.getList(false, true)

    assert.equal(list.length, 3)
    assert.equal(list[2].id, 4)
  })

  it('should limit', function() {
    var jobs = []
    for(var i = 0; i <= 20; i++) {
      jobs.push(createJob(true))
    }

    queue = createQueue({}, jobs)

    var list = queue.getList(false, false, 10)

    assert.equal(list.length, 10)
  })

  it('should return the correct job by id', function() {
    queue = createQueue({}, [
      createJob(true),
      Object.assign(createJob(true), { meta: { correct: true } }),
      createJob(true)
    ])

    var job = queue.getById(2)

    assert.equal(job.meta.correct, true)
  })

  it('should return the next job in queue', function() {
    queue = createQueue({}, [
      createJob(true),
      createJob(false, 3),
      createJob(false, 2),
      createJob(false),
      createJob(true)
    ])

    var job = queue.getNext()

    assert.equal(job.id, 3)
  })
})

describe('queue : processing', function() {
  beforeEach(function(){
    i = 0
    queue = createQueue()
  })

  it('should bump tries on eror', function(done) {
    var job = createJob(false)
    var generator = sinon.stub().returns(new Promise(resolve => resolve({
      code: '001',
      error: true
    })))
    queue = createQueue({}, [
      job
    ])

    queue.processJob(generator, job).then(response => {
      assert(error.isError(response))

      var dbJob = getQueue()[0]

      assert.equal(dbJob.generatorTries, 1)
      done()
    })
  })

  it('should mark as complete on success', function (done) {
    var job = createJob(false)
    queue = createQueue({}, [
      job
    ])

    var pingStub = sinon.stub(webhook, 'ping').returns(new Promise(resolve => resolve({ pinged: true })))
    var generatorStub = sinon.stub().returns(new Promise(resolve => resolve({
      completed: true,
      storage: {
        local: 'awesome'
      }
    })))

    var webhookOptions = { url: 'http://localhost' }
    queue.processJob(generatorStub, job, webhookOptions).then(response => {
      assert.equal(response.completed, true)

      var dbJob = getQueue()[0]

      assert.equal(dbJob.generatorTries, 1)
      assert(dbJob.completed_at !== null)
      assert(dbJob.storage.local, 'awesome')
      assert(response.completed, true)

      var pingArgs = pingStub.args[0]
      assert.equal(pingArgs[0], job)
      assert.equal(pingArgs[1], webhookOptions)

      pingStub.restore()
      done()
    })
  })
})

describe('queue : pinging', function() {
  beforeEach(function(){
    i = 0
    queue = createQueue()
  })

  it('should throw error if no webhook is configured', function() {
    var didThrow = false
    try {
      queue.attemptPing(createJob(true))
    } catch (e) {
      if (e.toString() === 'Error: No webhook is configured.') {
        didThrow = true
      }
    }

    assert(didThrow)
  })

  it('should attempt ping with correct parameters', function(done){
    var job = createJob(true)
    queue = createQueue({}, [
      job
    ])

    pingStub = sinon.stub(webhook, 'ping').returns(
      new Promise((resolve) => resolve({ message: 'yay' }))
    )

    var url = 'http://localhost';
    queue.attemptPing(job, {
      url: url
    }).then(response => {
      assert.equal(response.message, 'yay')

      dbJob = getQueue()[0]

      assert.equal(dbJob.pings.length, 1)
      assert.equal(dbJob.pingTries, 1)

      var ping = dbJob.pings[0]

      assert.equal(ping.message, 'yay')

      pingStub.restore()
      done()
    })
  })
})
