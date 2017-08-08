var sinon = require('sinon')

function createDbStub() {
  return {
    assign: createDbStub,
    get: createDbStub,
    find: createDbStub,
    write: createDbStub
  }
}

function createQueueStub(addToQueue) {
  if (!addToQueue) {
    addToQueue = sinon.stub()
    addToQueue.onCall(0).returns({
      id: 1234,
      url: 'https://google.com'
    })
  }

  return {
    addToQueue: addToQueue
  }
}

module.exports = {
  createQueueStub: createQueueStub
}
