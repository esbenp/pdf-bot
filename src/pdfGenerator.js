var path = require('path')
var puppeteer = require('puppeteer')
var uuid = require('uuid')
var debug = require('debug')('pdf:generator')
var error = require('./error')
var uuid = require('uuid')
var utils = require('./utils')

function createPdfGenerator(storagePath, options = {}, storagePlugins = {}) {
  return function createPdf (browser, url, job) {
    debug('Creating PDF for url %s with options %s', url, JSON.stringify(options))

    var generationId = uuid()
    var generated_at = utils.getCurrentDateTimeAsString()
    var jobId = job.id

    function createResponseObject() {
      return {
        id: generationId,
        generated_at: generated_at
      }
    }

    var pdfPath = path.join(storagePath, 'pdf', (job.id + '.pdf'))

    return browser.newPage().then(page => {
      return new Promise((resolve, reject) => {
        const logger = new InflightRequests(page)
        page
          .goto(url)
          .then(() => {
            var timer = setTimeout(() => {
              console.log(logger.inflightRequests().map(r => r.url()).join("\n"))
              reject(job.id + ' failed timeout.')
            }, 30000)

            page.exposeFunction("htmlPdfCb", () => {
              clearTimeout(timer)
              resolve()
            })
          })
      }).then(() => {
        return page
              .pdf({
                margin: {
                  bottom: 10,
                  left: 30,
                  right: 30,
                  top: 10
                },
                path: pdfPath
              })
              .then((pdf) => {
                debug('Saving PDF to %s', pdfPath)

                var storage = {
                  local: pdfPath
                }
                var storagePluginPromises = []
                for (var i in storagePlugins) {
                  // Because i will change before the promise is resolved
                  // we use a self executing function to inject the variable
                  // into a different scope
                  var then = (function(type) {
                    return function (response) {
                      return Object.assign(response, {
                        type: type
                      })
                    }
                  })(i)

                  storagePluginPromises.push(
                    storagePlugins[i](pdfPath, job).then(then)
                  )
                }

                return Promise.all(storagePluginPromises).then(responses => {
                  for(var i in responses) {
                    var response = responses[i]

                    storage[response.type] = {
                      path: response.path,
                      meta: response.meta || {}
                    }
                  }

                  return Object.assign(
                    createResponseObject(),
                    {
                      storage: storage
                    }
                  )
                })
              })
              .catch(msg => {
                var response = error.createErrorResponse(error.ERROR_HTML_PDF_CHROME_ERROR)

                response.message += ' ' + msg + ' (job ID: ' + jobId + '. Generation ID: ' + generationId + ')'

                return Object.assign(createResponseObject(), response)
              })
      }).catch((e) => {
        var errorResponse = error.createErrorResponse(error.ERROR_PUPPETEER)
        errorResponse.message = e

        return errorResponse
      })
    })
  }
}

module.exports = createPdfGenerator

class InflightRequests {
  constructor(page) {
    this._page = page;
    this._requests = new Set();
    this._onStarted = this._onStarted.bind(this);
    this._onFinished = this._onFinished.bind(this);
    this._onError = this._onError.bind(this);
    this._page.on('request', this._onStarted);
    this._page.on('requestfinished', this._onFinished);
    this._page.on('requestfailed', this._onFinished);
    this._page.on('error', this._onError);
    this._page.on('disconnected', () => {
      console.log('yooooo')
    })

  }

  _onStarted(request) { this._requests.add(request); }
  _onFinished(request) { this._requests.delete(request); }
  _onError(error) {
    console.log(error)
  }

  inflightRequests() { return Array.from(this._requests); }

  dispose() {
    this._page.removeListener('request', this._onStarted);
    this._page.removeListener('requestfinished', this._onFinished);
    this._page.removeListener('requestfailed', this._onFinished);
  }
}
