var htmlPdf = require('html-pdf-chrome')
var createS3Config = require('../src/storage/s3')

module.exports = {
  api: {
    port: 3000,
    token: 'api-token'
  },
  // html-pdf-chrome options
  generator: {
    completionTrigger: new htmlPdf.CompletionTrigger.Timer(1000), // waits for 1 sec
    // port: 9222 // chrome port
  },
  queue: {
    path: 'storage/db/db.json',
    lowDbOptions: {

    }
  },
  storage: {
    /*
    's3': createS3Config({
      bucket: '',
      accessKeyId: '',
      region: '',
      secretAccessKey: ''
    })
    */
  },
  webhook: {
    headerNamespace: 'X-PDF-',
    requestOptions: {

    },
    secret: '12345',
    url: 'http://localhost:3001/hook'
  }
}
