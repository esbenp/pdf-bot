var debug = require('debug')('pdf:s3')
var AWS = require('aws-sdk');
var path = require('path')
var fs = require('fs')

function createS3Storage(options = {}) {
  if (!options.accessKeyId) {
    throw new Error('S3: No access key given')
  }

  if (!options.secretAccessKey) {
    throw new Error('S3: No secret access key given')
  }

  if (!options.region) {
    throw new Error('S3: No region specified')
  }

  if (!options.bucket) {
    throw new Error('S3: No bucket was specified')
  }

  return function uploadToS3 (localPath, job) {
    return new Promise((resolve, reject) => {
      var client = new AWS.S3({
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        region: options.region,
      })

      var remotePath = (options.path || '')
      if (typeof options.path === 'function') {
        remotePath = options.path(localPath, job)
      }

      var pathSplitted = localPath.split('/')
      var fileName = pathSplitted[pathSplitted.length - 1]
      var fullRemotePath = path.join(remotePath, fileName)

      var Key = fullRemotePath
      var Body = fs.readFileSync(localPath)

      debug('Pushing job ID %s to S3 path: %s/%s', job.id, options.bucket, fileName)

      client.putObject({
        Bucket: options.bucket,
        Key: Key,
        Body: Body
      })
      .promise()
      .then(function (data) {
        resolve({
          path: {
            bucket: options.bucket,
            region: options.region,
            key: Key
          }
        })
      })
      .catch(function (err) {
        reject(err)
      })
    })
  }
}

module.exports = createS3Storage
