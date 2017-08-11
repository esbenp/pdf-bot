var htmlPdf = require('html-pdf-chrome')
var uuid = require('uuid')
var debug = require('debug')('pdf:generator')
var error = require('./error')

function createPdfGenerator(options = {}, storagePlugins = {}) {
  return function createPdf (url, job) {
    debug('Creating PDF for url %s with options %s', url, JSON.stringify(options))

    return htmlPdf
      .create(url, options)
      .then((pdf) => {
        var path = 'storage/pdf/' + uuid() + '.pdf'

        debug('Saving PDF to %s', path)

        pdf.toFile(path)

        var storage = {
          local: path
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
            storagePlugins[i](path, job).then(then)
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

          return {
            storage: storage
          }
        })
      })
      .catch(msg => {
        var response = error.createErrorResponse(error.ERROR_HTML_PDF_CHROME_ERROR)

        response.message += ' ' + msg

        return response
      })
  }
}

module.exports = createPdfGenerator
