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
var ERROR_PUPPETEER = 'ERROR_PUPPETEER'
var ERROR_META_IS_NOT_OBJECT = 'ERROR_META_IS_NOT_OBJECT'
var ERROR_DOCTYPE_IS_NOT_STRING = 'ERROR_DOCTYPE_IS_NOT_STRING'
var ERROR_INVALID_JSON_RESPONSE = 'ERROR_INVALID_JSON_RESPONSE'

var errorCodes = {
  [ERROR_INVALID_TOKEN]: '001',
  [ERROR_INVALID_URL]: '002',
  [ERROR_PUPPETEER]: '003',
  [ERROR_META_IS_NOT_OBJECT]: '004',
  [ERROR_INVALID_JSON_RESPONSE]: '005',
  [ERROR_DOCTYPE_IS_NOT_STRING]: '006'
}

var errorMessages = {
  [ERROR_INVALID_TOKEN]: 'Invalid token.',
  [ERROR_INVALID_URL]: 'Invalid url.',
  [ERROR_PUPPETEER]: 'puppeteer error:',
  [ERROR_META_IS_NOT_OBJECT]: 'Meta data is not a valid object',
  [ERROR_DOCTYPE_IS_NOT_STRING]: 'Doctype in request is not a valid string',
  [ERROR_INVALID_JSON_RESPONSE]: 'Invalid JSON response'
}

module.exports = {
  createErrorResponse: createErrorResponse,
  isError: isError,
  getErrorCode: getErrorCode,
  ERROR_INVALID_TOKEN: ERROR_INVALID_TOKEN,
  ERROR_INVALID_URL: ERROR_INVALID_URL,
  ERROR_PUPPETEER: ERROR_PUPPETEER,
  ERROR_META_IS_NOT_OBJECT: ERROR_META_IS_NOT_OBJECT,
  ERROR_INVALID_JSON_RESPONSE: ERROR_INVALID_JSON_RESPONSE,
  ERROR_DOCTYPE_IS_NOT_STRING: ERROR_DOCTYPE_IS_NOT_STRING
}
