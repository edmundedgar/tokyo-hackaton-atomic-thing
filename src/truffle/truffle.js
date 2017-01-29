module.exports = {
  build: {
    "index.html": "index.html",
    "company.html": "company.html",
    "app.js": [
      "javascripts/app.js"
    ],
    "company.js": [
      "javascripts/company.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/"
  },
  rpc: {
    host: "localhost",
    port: 8545
  }
};
