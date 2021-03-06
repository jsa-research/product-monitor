const path = require('path')
const pathParse = require('path-parse')
const request = require('request')
const url = require('url')
const express = require('express')

const apiControllerFactory = require('./monitor/controllers/apiController')
const pageControllerFactory = require('./monitor/controllers/pageController')
const pluginControllerFactory = require('./monitor/controllers/pluginController')

const defaultConfig = require('./monitor/defaultConfig')
const authSetup = require('./monitor/authentication/setup')
const serverLog = require('./monitor/models/serverLog')
const serverDetails = require('./monitor/models/serverDetails')
const routesModel = require('./monitor/models/routes')
const pluginsModel = require('./monitor/models/plugins')
const preflightModel = require('./monitor/models/preflight')()
const NL = '\n'

// Define all the routes supported by the server, including dynamic ones
function configureRoutes (instance) {
  // Unpack variables from instance
  var server = instance.server
  var config = instance.config

  // Permit CORS access to this server
  var corsSupport = require('./monitor/corsSupport')
  server.use(corsSupport)

  // Return status endpoint to its new home
  server.use('/status', function (req, res) {
    res.status(200).jsonp({
      message: 'Server is running OK'
    })
  })

  // Serve static files locally
  server.use('/favicon.ico', express.static(path.join(config.userContentPath, '/images/favicon.ico')))
  server.use('/images', express.static(path.join(config.userContentPath, '/images')))
  server.use('/external', express.static(path.join(__dirname, '/../monitoring/external')))
  server.use('/fonts', express.static(path.join(__dirname, '/../monitoring/fonts')))

  server.use(preflightModel.all)

  return Promise.resolve()
}

function createContentRoutes (server, pageController) {
  // Create user index route
  server.get('/', pageController.renderUserContent)

  // Create user content route
  server.get('/content/:contentPath', pageController.renderUserContent)

  // Create user content route for API purposes
  server.get('/api/content/read/:contentPath', pageController.readUserContent)
  server.post('/api/content/save/:contentPath', pageController.saveUserContent)

  return Promise.resolve()
}

// Well, good luck...
function restartServer (instance) {
  process.exit(0)
}

// Kick express into action
function heyListen (instance, onListening) {
  // Unpack variables from instance
  var server = instance.server
  var config = instance.config

  function reportListening () {
    const title = config.productInformation.title
    global.listeningTime = (Date.now() - global.startTime) / 1000
    console.log(`[${title} Listening] on`, global.hostUrl, '-- Start up time:', global.listeningTime.toFixed(2), 'ms', NL)
  }

  instance.httpServer = server.listen(config.serverPort, config.ipAddress, function () {
    global.hostUrl = url.format({
      protocol: 'http',
      hostname: 'localhost',
      query: '',
      pathname: '',
      port: config.serverPort
    })

    if (onListening && typeof onListening === 'function') {
      onListening(null)
    }
      // Prod the navigation endpoint
    request(global.hostUrl + '/api/navigation', reportListening)
  })
    .on('error', function (e) {
      console.log('Could not start server: ')
      if (e.code === 'EADDRINUSE') {
        console.log(' Port address already in use.')
      }
      console.log('  ' + e)

      if (onListening && typeof onListening === 'function') {
        onListening(false)
      }
    })

  return instance.httpServer
}

// Things to do to start the server
function startServer (config, onReady) {
  // Form a response
  var instance = {}
  var models = {}

  // Register models
  models.serverLog = serverLog
  models.serverDetails = serverDetails
  models.routes = routesModel
  models.plugins = pluginsModel
  models.preflight = preflightModel

  // Capture console
  serverLog.capture()

  // Create server
  var server = express()

  // Load default for conig
  config = defaultConfig.merge(config)
  config.server = server
  config.models = models

  // Register a static reference in serverDetails
  serverDetails.instance = instance

  // Report server name
  const title = config.productInformation.title
  console.log(NL + `[Starting ${title}]`, NL)
  global.startTime = Date.now()

  // Collapse variables onto instance
  instance.server = server
  instance.config = config
  instance.restart = function () {
    restartServer(instance)
  }
  instance.listen = function (onListening) {
    return heyListen(instance, onListening)
  }

  // Register Page controller
  const pageController = pageControllerFactory.configure(config)

  // Create API controller
  const apiController = apiControllerFactory.configure(config)

  // Create Plugin controller
  const pluginController = pluginControllerFactory.configure(config)

  instance.addContentPage = function (file) {
    var pathInfo = pathParse(file)
    // Remove the .fragment part:
    var route = '/docs/' + pathParse(pathInfo.name).name
    server.get(route, pageController.createRenderFunctionFor(file))
    return route
  }

  instance.registerPluginAPIs = apiController.registerPluginAPIs

  // Run first-time install checks, and then start server:
  var firstTimeInstall = require('./monitor/firstTimeInstall')
  firstTimeInstall.configure(config)
  firstTimeInstall.runChecks(function () {
    // Register local content routes
    authSetup(instance)
      .then(() => configureRoutes(instance))
      .then(() => createContentRoutes(server, pageController))
      .then(apiController.registerUserAPIs)
      .then(() => pluginController.loadBuiltInPlugins(instance))
      .then(() => pluginController.loadUserPlugins(instance))
      .then(onConfigured)
      .catch((ex) => console.log('[Product Monitor]', ex, ex.stack))
  })

  function onConfigured () {
    // Check for an onReady callback
    if (onReady && typeof onReady === 'function') {
      // Let the user call listen when ready
      console.log(`[${title}]`, 'ready to run! Call instance.listen() on your callback.')
      onReady(instance)
    } else {
      // Call listen ourselves
      instance.listen()
    }
  }

  return instance
}

module.exports = function (config, onReady) {
  // Do the starting
  const instance = startServer(config, onReady)

  // Wait here
  return instance
}
