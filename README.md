# pdf-bot

Easily create a microservice for generating PDFs using headless Chrome.

`pdf-bot` is installed on a server and will receive URLs to turn into PDFs through its API or CLI. `pdf-bot` will manage a queue of PDF jobs. Once a PDF job has run it will notify you using a webhook so you can fetch the API. `pdf-bot` supports storing PDFs on S3 out of the box.

![How to use the pdf-bot CLI](http://imgur.com/aRHye2l.gif)
