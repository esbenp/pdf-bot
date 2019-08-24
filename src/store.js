const s3client = require('./storage/s3')

const storageDirectory = {
  s3: s3client
}

const store = async (job) => {
  const promises = []

  for(let key in job.data.storage) {
    // Because i will change before the promise is resolved
    // we use a self executing function to inject the variable
    // into a different scope
    var then = (function(type) {
      return function (response) {
        return {
          type,
          path: response.path
        }
      }
    })(key)

    const storageClient = storageDirectory[key](job.data.storage[key])

    const storagePromise = storageClient(
      job.data.storage_path,
      job
    ).then(then)

    promises.push(storagePromise)
  }

  return await Promise.all(promises)
}

module.exports = store
