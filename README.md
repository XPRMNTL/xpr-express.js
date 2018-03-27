[![XPRMNTL][logo-image]][logo-url]
# XPR-Express.js

[![Greenkeeper badge](https://badges.greenkeeper.io/XPRMNTL/xpr-express.js.svg)](https://greenkeeper.io/)
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][downloads-url]
[![Tips][gratipay-image]][gratipay-url]

This is a Node.js plugin for XPRMNTL [feature-client](https://github.com/XPRMNTL/feature-client.js).
It adds the ability to call `req.feature` from within an
[express.js](http://expressjs.com/) app. `req.feature('expName')` returns the value of the
feature.

## Installation
```sh
$ npm install xpr-express
```

## API

```js
var featureClient = require('feature-client');
var xprExpress = require('xpr-express');
var app = require('express')();
var cookieParser = require('cookie-parser');

featureClient.use(xprExpress());
app.use(cookieParser());
app.use(featureClient.express);

app.get('/', function() {
  if (req.feature('featureName')) {
    // Do something with feature on
  } else {
    // Do something for feature off
  }
});
```

### xprExpress(config)
  - `config.cookieName` is used if no readExps/saveExps are defined. Feature configuration is stored in the user's cookie as needed.
  - `config.readExps` is a function with the following footprint:

      Defaults to reading an experiment cookie (`config.cookieName`)

      ```js
      function(req, res) {
        // read experiment data from express `req` and `res` or other means
        return experiments; // see Experiment Format
      }
      ```

  - `config.saveExps` is a function with the following footprint:

      Defaults to writing an experiment cookie (`config.cookieName`)

      ```js
      function(userID, experiments, res) {
        // Save experiment configuration to express `res` or other means

        return; // nothing
      }
      ```

  - Experiment Format:
    ```js
    {
      userID: userID,
      bucket: bucketNumber, // 0-99
      app: {
        userID: userID,
        bucket: bucketNumber, // May be different
        stamp: someHash, // Used to determine when out-of-date
        features: {}, // Key,value of what is already used for this user
        dirtyFeatures: {}, // Used to override library experiments with `this.features`
      },
      shared: {} // Same format as `this.app`
    }
    ```

### Added `feature-client` functionality

  - `featureClient.express` is the express middleware that is added to featureClient. It attaches the req.feature() function to the `req` object.
  - `req.feature` is a function that determines if a user has an experiment enabled.

### Setting features via url
As of v1.0.0, you now have the ability to turn experiments on/off via the url. This is only on a per-user basis, similar to [xpr-toggle](https://github.com/XPRMNTL/xpr-toggle.js).

Example
`[appUrl]/[path]/?xpr.featName1=true` - Sets feature "featName1" to true
`[appUrl]/[path]/?xpr.featName1=false&featName=true` - Sets feature "featName1" to false and "featName2" to true

This also allows you to enable features that normally would not show up in the list (secret features).

### FAQ
1. The default read/write methods are not working.
  - Make sure you are using `express.cookieParser` __before__ `featureClient.express`. This is not done for you in case you do your own state lookups.

[logo-image]: https://raw.githubusercontent.com/XPRMNTL/XPRMNTL.github.io/master/images/ghLogo.png
[logo-url]: https://github.com/XPRMNTL/XPRMNTL.github.io
[npm-image]: https://img.shields.io/npm/v/xpr-express.svg
[npm-url]: https://www.npmjs.org/package/xpr-express
[downloads-image]: https://img.shields.io/npm/dm/xpr-express.svg
[downloads-url]: https://www.npmjs.org/package/xpr-express
[gratipay-image]: https://img.shields.io/gratipay/dncrews.svg
[gratipay-url]: https://www.gratipay.com/dncrews/
