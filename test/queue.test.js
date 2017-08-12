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
function createJob(completed = false, generationTries = 0, pingTries = 0) {
  i++

  var generations = []
  for(var k = 0; k < generationTries; k++) {
    generations.push({ id: 'xxx' })
  }
  var pings = []
  for(var k = 0; k < pingTries; k++) {
    pings.push({ id: 'xxx' })
  }

  return {
    id: i,
    completed_at: (completed ? '2017-01-01' : null),
    generations: generations,
    pings: pings
  }
}

describe('queue : retrieval', function() {
  var queue
  beforeEach(function() {
    i = 0
    queue = createQueue()
  })

  afterEach(function(){
    deleteQueue()
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
      createJob(false, 0) // has not been run yet
    ])

    var list = queue.getList(true)

    assert.equal(list.length, 2)
    assert.equal(list[0].id, 1)
  })

  it('should return completed jobs', function() {
    queue = createQueue({}, [
      createJob(true),
      createJob(true),
      createJob(false, 1)
    ])

    var list = queue.getList(false, true)

    assert.equal(list.length, 2)
    assert.equal(list[1].id, 2)
  })

  it('should return new jobs', function() {
    queue = createQueue({}, [
      createJob(true),
      createJob(true),
      createJob(false, 1), // failed
      createJob(false, 0) // new
    ])

    var list = queue.getList(false, false)

    assert.equal(list.length, 1)
    assert.equal(list[0].id, 4)
  })

  it('should limit', function() {
    var jobs = []
    for(var i = 0; i <= 20; i++) {
      jobs.push(createJob(false))
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

  it('should return the next job if no tries were found', function() {
    queue = createQueue({}, [
      createJob(true),
      createJob(false, 5),
      createJob(false),
      createJob(true)
    ])

    var job = queue.getNext(function(){}, 5)

    assert.equal(job.id, 3)
  })

  it('should return the next job that is within decay schedule', function() {
    var dateOne = inFiveMinutes()
    var dateTwo = fiveMinutesAgo()

    var jobWithManyGenerations = []
    for(var k = 0; k < 10; k++) {
      jobWithManyGenerations.push({ id: k, generated_at: dateTwo })
    }

    queue = createQueue({}, [
      createJob(true),
      Object.assign(createJob(false), { generations: jobWithManyGenerations }), // should skip this due to generations
      Object.assign(createJob(false), { generations: [{id: 1, generated_at: dateOne }] }), // should skip due to decay
      Object.assign(createJob(false), { generations: [{id: 1, generated_at: dateTwo }] })
    ])

    var job = queue.getNext(function(){ return 1000 * 60 * 4 }, 5)

    assert.equal(job.id, 4)
  })

  it('should get next with no pings', function() {
    var jobWithManyPings = []
    for(var k = 0; k < 10; k++) {
      jobWithManyPings.push({ id: k, sent_at: fiveMinutesAgo(), error: true })
    }

    queue = createQueue({}, [
      Object.assign(createJob(true, 1, 5), {pings: jobWithManyPings}), // exceeds limit
      createJob(false, 1, 0), // should skip since it is not completed
      Object.assign(createJob(true, 1), {pings: [{id:55, sent_at: fiveMinutesAgo(), error: true }]})
    ])

    var job = queue.getNextWithoutSuccessfulPing(function(){ return 1000 * 60 * 4 }, 5)

    assert.equal(job.id, 3)
  })

  it('should get next ping that is within decay schedule', function() {
    var dateOne = fiveMinutesAgo()
    var dateTwo = inFiveMinutes()

    var jobWithManyPings = []
    for(var k = 0; k < 10; k++) {
      jobWithManyPings.push({ id: k, sent_at: dateTwo, error: true })
    }

    queue = createQueue({}, [
      // not within decay
      Object.assign(createJob(true), { pings: [{ id: 1, error: true, sent_at: dateTwo }, { id: 2, error: true, sent_at: dateTwo }] }),
      // too many pings
      Object.assign(createJob(true), { pings: jobWithManyPings }),
      // next
      Object.assign(createJob(true), { pings: [{ id: 4, error: true, sent_at: dateOne }] }),
      // after previous
      Object.assign(createJob(true), { pings: [{ id: 5, error: true, sent_at: dateOne }] })
    ])

    var job = queue.getNextWithoutSuccessfulPing(function() { return 1000 * 60 * 4 }, 5)

    assert.equal(job.id, 3)
  })
})

describe('queue : processing', function() {
  beforeEach(function(){
    i = 0
    queue = createQueue()
  })

  afterEach(function(){
    deleteQueue()
  })

  it('should log generation', function(done) {
    var job = createJob(false)
    var errorGenerator = sinon.stub().returns(new Promise(resolve => resolve({
      code: '001',
      error: true
    })))
    var successGenerator = sinon.stub().returns(new Promise(resolve => resolve({
      success: true
    })))
    queue = createQueue({}, [
      job
    ])

    Promise.all([
      queue.processJob(errorGenerator, job),
      queue.processJob(successGenerator, job)
    ]).then(function(responses) {
      assert(error.isError(responses[0]))
      assert(!error.isError(responses[1]))

      var dbJob = getQueue()[0]

      assert.equal(dbJob.generations.length, 2)
      assert.equal(dbJob.generations[0].code, '001')
      assert.equal(dbJob.generations[1].success, true)

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

  afterEach(function(){
    deleteQueue()
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

      var ping = dbJob.pings[0]

      assert.equal(ping.message, 'yay')

      pingStub.restore()
      done()
    })
  })
})

function inFiveMinutes() {
  var dateOne = new Date()
  dateOne.setTime(dateOne.getTime() + (1000 * 60 * 5)) // add 5 minutes
  return dateOne.toUTCString()
}

function fiveMinutesAgo() {
  var dateOne = new Date()
  dateOne.setTime(dateOne.getTime() - (1000 * 60 * 5)) // add 5 minutes
  return dateOne.toUTCString()
}
