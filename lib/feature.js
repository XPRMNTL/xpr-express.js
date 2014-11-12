/**
 * XPRMNTL Feature-client.js Plugin:
 * XPR - Feature
 *
 * Provides a middleware for `req.feature` as well
 * as an additional `app.feature` for experiments
 * that are outside of the scope of a user/request
 */

/**
 * Module Dependencies
 */
var client = require('feature-client')
  , expLib = require('experiment')
  , debug = require('debug')('XPRMNTL:feature');

/**
 * These are the two experiments we're working on throughout
 */
var exps = {
  app: expLib(),
  shared: expLib()
};

/**
 * These are the hashes of the current configuration
 * of experiments of each type. This lets us know if the user
 * has outdated experiments data.
 */
var hashes = {
  app: null,
  shared: null
};

/**
 * This stores the most recent fetched data
 */
var _lastFetch;

/**
 * Have we had a successful fetch?
 */
var _fetched;

/**
 * Backed up remote functions
 */
var _load = client.load;
var _announce = client.announce;

/**
 * Memoized functions
 */
client.load = memoize(_load);
client.blahblah = 'hi';
console.log(client.load);
client.announce = memoize(_announce);

/**
 * Memoizes the functions and binds to client
 */
function memoize(fn) {
  return (function(cb) {
    return fn(cb).then(function success(config) {
      debug('dowhatnow?!');
      saveLast(config);
    }, function failure(data) {
      var err = data[0]
        , defaults = data[1];

      debug('Fetch err: ', err);
      saveLast(defaults, true);
    });
  }).bind(client);
}

function saveLast(config, optional) {
  if (optional && _fetched) return;
  var ref = client.getReference();

  hashes.app = exps.app.configure(config.app || {}, ref);
  hashes.shared = exps.shared.configure(config.shared || {}, ref);

  _fetched = true;
  _lastFetch = config;
}

/**
 * These variables store the hash of the current configuration
 * of experiments of each type. This lets us know if the user
 * has outdated experiments data.
 */
client.getMiddleware = function(readUser, saveUser) {
  readUser = readUser || defaultReadUser;
  saveUser = saveUser || defaultSaveUser;



  return function reqFeature(req, res, next) {
    var user = readUser(req);
    var userContexts = {
      app: exps.app(user.bucket, user.id),
      shared: exps.shared.contextFor(user.bucket, user.id)
    };

    console.log(userContexts);

    var userExps = {
      app: exps.app.readFor(userContexts.app, user.dirty.app),
      shared: exps.shared.readFor(userContexts.shared, user.dirty.shared)
    };

    // TODO: if the user is outdated, generate a new cookie.
    saveUser(res);



    // QQ: Do I want to save a new cookie every time, to keep it updated?


    req.feature = function(name, fallback) {
      if (undefined === fallback) fallback = false;

      if (undefined === userExps.app.features[name] === userExps.shared.features[name]) return fallback;

      var statuses = {
        app: exps.app.feature(name, userExps.app),
        shared: exps.shared.feature(name, userExps.shared),
      };

      console.log(statuses);

      if (undefined !== statuses.app) {
        return statuses.shared;
      } else {
        return statuses.app;
      }
    };

    next();
  };
};


client.appFeature = function(name, fallback) {

};


/**
 * Default deserializer for the user object in express
 *
 * @param  {Object} req Express.js request object
 * @return {Object}     `user` object
 *
 * Example return:
 *
 * ```js
 * {
 *   id: string,
 *   bucket: int,
 *   hashes: {
 *     app: string,
 *     shared: string
 *   }
 *   dirty: {
 *     app: {
 *       key1: value1,
 *       ...
 *       keyN: valueN,
 *     },
 *     shared: {
 *       key1: value1,
 *       ...
 *       keyN: valueN,
 *     },
 *     passthrough: 'this is something that will exist through the whole process'
 *   }
 * }
 * ```
 */
function defaultReadUser(req) {
  return {
    id: 'something',
    bucket: 1,
    hashes: {
      app: 'yeah, no',
      shared: 'no, yeah'
    },
    dirty: {
      app: {
        exp1: true,
        exp2: false,
      },
      shared: {
        shExp1: false,
        shExp2: true,
      }
    },
    passthrough: {
      stay: 'please, please don\'t go'
    }
  };
}

function defaultSaveUser(config, res) {

}
