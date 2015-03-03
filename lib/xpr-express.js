/**
 * XPRMNTL Feature-client.js Plugin:
 * XPR - Connect
 *
 * Provides a middleware for `req.feature` as well
 * as an additional `app.feature` for experiments
 * that are outside of the scope of a user/request
 */

/**
 * Module Dependencies
 */
var expLib = require('experiment')
  , debug = require('debug')('XPRMNTL:express');

// TODO: Make this configurable
var _cookieName = 'xpr.config';

module.exports = function(client) {

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
  client.announce = memoize(_announce);

  client.getMiddleware = getMiddleware;

  /**
   * Memoizes the functions and binds to client
   */
  function memoize(fn) {
    return function(cb) {
      return fn.call(client, cb).then(function success(config) {
        debug('dowhatnow?!');
        _saveLast(config);
      }, function failure(data) {
        var err = data[0]
          , defaults = data[1];

        debug('Fetch err: ', err);
        _saveLast(defaults, true);
      });
    };
  }

  /**
   * Saves the last-fetch configuration
   *
   * If there is already a configuration, this does not override that
   * if the previous call was an error. This allows a startup to fetch
   * correct data, and on failure, not fall back to `default` data
   */
  function _saveLast(config, optional) {
    if (optional && _fetched) return;
    var ref = client.getReference();

    hashes.app = exps.app.configure(config.app || {}, ref);
    if (config.shared && config.shared.experiments) hashes.shared = exps.shared.configure(config.shared, ref);

    _fetched = true;
    _lastFetch = config;
  }

  /**
   * Given read/write functions for the user, this method returns
   * connect middleware that attaches the req.feature() method to
   * the req object.
   *
   *
   * @param  {Function} readUser    Function called with req, res and should return a `user` object
   * @param  {Function} saveUser    Function called with user.id, experiments, res and should save to the `user` object
   * @return {Function} reqFeature  Connect middleware that when .use()d, will attach req.feature
   */
  function getMiddleware(readUser, saveUser) {
    readUser = readUser || defaultReadUser;
    saveUser = saveUser || defaultSaveUser;

    return function reqFeature(req, res, next) {
      var user = readUser(req, res);
      if (! user) user = { dirty: {} };

      var userContexts = {
        app: exps.app.contextFor(user.bucket, user.id),
        shared: exps.shared.contextFor(user.bucket, user.id)
      };

      var userExps = {
        app: exps.app.readFor(userContexts.app, user.dirty.app),
        shared: exps.shared.readFor(userContexts.shared, user.dirty.shared)
      };

      // TODO: only if the user is outdated, generate a new cookie.
      if (user.id) saveUser(user.id, userExps, res);

      // QQ: Do I want to save a new cookie every time, to keep it updated?


      req.feature = function(name, fallback) {
        if (undefined === fallback) fallback = false;

        if (undefined === userExps.app.features[name] === userExps.shared.features[name]) return fallback;

        var statuses = {
          app: exps.app.feature(name, userExps.app),
          shared: exps.shared.feature(name, userExps.shared),
        };

        return statuses.app || statuses.shared;
      };

      next();
    };
  }

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
 *     }
 *   }
 * }
 * ```
 */
function defaultReadUser(req, res) {
  var defaultCookie = {
    id: 'somethingHere',
    dirty: {}
  };
  var rawCookie = req.cookies[_cookieName];
  if (! rawCookie) return defaultCookie;

  var user;

  var matcher = /u:([^«]*)«b:([^╣]*)╣app:«s:([^«]*)«d:([^║]*)║╣shared:«s:([^«]*)«d:([^║]*)║/;
  var matches = matcher.exec(rawCookie);

  try {
    user = {
      id : matches[1],
      bucket : matches[2],
      hashes : {
        app: matches[3],
        shared: matches[5]
      },
      dirty : {
        app: JSON.parse(matches[4]),
        shared: JSON.parse(matches[6])
      }
    };
  } catch (e) {
    console.warn('Experiment cookie bad: ', e);
    res.clearCookie(_cookieName);
    return defaultCookie;
  }

  // var user = {
  //   id: 'something',
  //   bucket: 1,
  //   hashes: {
  //     app: 'yeah, no',
  //     shared: 'no, yeah'
  //   },
  //   dirty: {
  //     app: {
  //       objectedExp: true,
  //       exp1: true,
  //       exp2: false,
  //     },
  //     shared: {
  //       shExp1: false,
  //       shExp2: true,
  //     }
  //   }
  // };

  return user;
}

function defaultSaveUser(id, config, res) {
  var serial = _serializeUser(id, config);

  res.cookie(_cookieName, serial, { maxAge: 900000 });
}

function _serializeUser(id, data) {
  var serial = 'u:' + id + '«b:' + data.app.bucket;

  serial += _serializeAppData('app', data.app);
  serial += _serializeAppData('shared', data.shared);


  console.log(serial);
  return serial;
}

function _serializeAppData(name, config) {
  var serial = '╣' + name + ':';

  serial += '«s:' + config.stamp;
  serial += '«d:' + JSON.stringify(config.dirtyFeatures);

  serial += '║';

  return serial;
}

