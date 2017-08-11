function createErrorResponse (type) {
  return {
    code: errorCodes[type],
    error: true,
    message: errorMessages[type]
  }
}

function isError (response) {
  return response.error && response.code
}

function getErrorCode(type) {
  return errorCodes[type]
}

var ERROR_INVALID_TOKEN = 'ERROR_INVALID_TOKEN'
var ERROR_INVALID_URL = 'ERROR_INVALID_URL'
var ERROR_HTML_PDF_CHROME_ERROR = 'ERROR_HTML_PDF_CHROME_ERROR'
var ERROR_META_IS_NOT_OBJECT = 'ERROR_META_IS_NOT_OBJECT'

var errorCodes = {
  [ERROR_INVALID_TOKEN]: '001',
  [ERROR_INVALID_URL]: '002',
  [ERROR_HTML_PDF_CHROME_ERROR]: '003',
  [ERROR_META_IS_NOT_OBJECT]: '004'
}

var errorMessages = {
  [ERROR_INVALID_TOKEN]: 'Invalid token.',
  [ERROR_INVALID_URL]: 'Invalid url.',
  [ERROR_HTML_PDF_CHROME_ERROR]: 'html-pdf-chrome error:',
  [ERROR_META_IS_NOT_OBJECT]: 'Meta data is not a valid object'
}

module.exports = {
  createErrorResponse: createErrorResponse,
  isError: isError,
  getErrorCode: getErrorCode,
  ERROR_INVALID_TOKEN: ERROR_INVALID_TOKEN,
  ERROR_INVALID_URL: ERROR_INVALID_URL,
  ERROR_HTML_PDF_CHROME_ERROR: ERROR_HTML_PDF_CHROME_ERROR,
  ERROR_META_IS_NOT_OBJECT: ERROR_META_IS_NOT_OBJECT
}
