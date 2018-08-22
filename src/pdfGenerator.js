var path = require('path')
var htmlPdf = require('html-pdf-chrome')
var uuid = require('uuid')
var debug = require('debug')('pdf:generator')
var error = require('./error')
var uuid = require('uuid')
var utils = require('./utils')

function createPdfGenerator(storagePath, options = {}, storagePlugins = {}) {
  return function createPdf (url, job) {
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

    return htmlPdf
      .create(url, options)
      .then((pdf) => {
        var pdfPath = path.join(storagePath, 'pdf', (uuid() + '.pdf'))

        debug('Saving PDF to %s', pdfPath)

        return pdf
          .toFile(pdfPath)
          .then(function(response){
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
      })
      .catch(msg => {
        var response = error.createErrorResponse(error.ERROR_HTML_PDF_CHROME_ERROR)

        response.message += ' ' + msg + ' (job ID: ' + jobId + '. Generation ID: ' + generationId + ')'

        return Object.assign(createResponseObject(), response)
      })
  }
}

module.exports = createPdfGenerator
