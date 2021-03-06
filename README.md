
## Requirements

AWS SDK v2.7.15 or greater if using captureAWS or captureAWSClient

## AWS X-Ray

The AWS X-Ray SDK automatically records information for incoming and outgoing requests and responses (via middleware), as well as local data
such as function calls, time, variables (via metadata and annotations), even EC2 instance data (via plug-ins). Currently, only Express
applications are supported for auto capturing, see the aws-xray-sdk-express package for additional information.

The SDK exposes the Segment and Subsegment objects to create your own capturing mechanisms, but a few are supplied.
These keep the current subsegment up to date in automatic mode, or propagate the current subsegment in manual mode.

AWSXRay.captureFunc - Takes a function that takes a single subsegment argument. This will create a new nested subsegment and expose it. The segment
will close automatically when the function completes executing. This will not correctly time functions with asynchronous calls, instead use
captureAsyncFunc.

AWSXRay.captureAsyncFunc - Takes a function that takes a single subsegment argument. This will create a new nested subsegment and expose it. The segment
must be closed using subsegment.close() or subsegment.close(error) when the asynchronous function completes.

AWSXRay.captureCallbackFunc - Takes a function to be used as a callback. Useful for capturing callback information and directly associate it to the call
that generated it. This will create a new nested subsegment and expose it by appending it onto the arguments used to call the callback. For this reason,
always call your captured callbacks with the full parameter list. The subsegment will close automatically when the function completes executing.

## Setup

### automatic and manual mode

The AWS X-Ray SDK has two modes: 'manual' and 'automatic'.
By default, the SDK is in automatic mode. You can flip the mode of the SDK using the following.

    AWSXRay.enableManualMode();

    AWSXRay.enableAutomaticMode();

#### automatic mode

Automatic mode is for use with the aws-xray-sdk-express module to support Express applications, but can be used outside of this.
The aws-xray-sdk-express module captures incoming request/response information via middleware and creates the base segment object automatically.
If your application is not using the Express middleware, you will have to create a new segment, and set this on the SDK when in automatic mode.

    var segment = new AWSXRay.Segment(name, [optional root ID], [optional parent ID]);
    AWSXRay.setSegment(segment);

For more information about developing your own middleware or using automatic mode without middleware, please see the 'developing custom solutions
using automatic mode' section below.

Automatic mode uses the Continuation Local Storage package and automatically keeps track of the current segment or subsegment when using the built in
capture functions or any of the aws-xray-sdk modules. Using the built-in capture functions or other aws-xray-sdk modules will automatically create
new subsegments to capture additional data and update the current sub/segment on that context.

The current sub/segment can be retrieved at any time using the following.

    var segment = AWSXRay.getSegment();

#### manual mode

Manual mode requires you pass around the segment reference. See examples below for the different usages.

### environment variables

**Environment variables always override values set in code.**

    AWS_XRAY_DEBUG_MODE              Enables logging to console output. Logging to a file is no longer built in, see 'configure logging' below.
    AWS_XRAY_TRACING_NAME            For overriding the default segment name to be used with the middleware. See 'dynamic and fixed naming modes'.
    AWS_XRAY_DAEMON_ADDRESS          For setting the daemon address and port. Expects 'x.x.x.x', ':yyyy' or 'x.x.x.x:yyyy' IPv4 formats.
    AWS_XRAY_CONTEXT_MISSING         For setting the SDK behavior when trace context is missing. Valid values are 'RUNTIME_ERROR' or 'LOG_ERROR'. The SDK's default behavior is the same as 'RUNTIME_ERROR'.

### daemon configuration

By default, the SDK expects the daemon to be at 127.0.0.1 (localhost) on port 2000. You can override the address, port, or both.
This can be changed via the environment variables listed above, or through code. The same format is applicable for both.

    AWSXRay.setDaemonAddress('186.34.0.23:8082');
    AWSXRay.setDaemonAddress(':8082');
    AWSXRay.setDaemonAddress('186.34.0.23');

### configure logging

Default logging to a file has been removed. To set up file logging, please configure a logger which responds to debug, info, warn and error functions.
To log information about configuration, make sure you set the logger before other configuration options.

    AWSXRay.setLogger(logger);

#### sampling configuration

When using our supported X-Ray enabled frameworks (ie: aws-xray-sdk-express) you can configure the rates at which the SDK samples requests to capture.

A sampling rule defines the rate at which requests are sampled for a particular endpoint, HTTP method and URL of the incoming request.
In this way, you can change the behavior of sampling using http_method, service_name, url_path attributes to specify the route, then use
fixed_target and rate to determine sampling rates.

Fixed target refers to the maximum number of requests to sample per second. When this threshold has been reached, the sampling decision
will use the specified percentage (rate) to sample on.

The SDK comes with a default sampling file at /lib/resources/sampling_rules.js. You can choose to override this by providing one.

    AWSXRay.middleware.setSamplingRules(<path to file>);

A sampling file must have a "default" defined. The default matches all routes as a fall-back, if none of the rules match.

    {
      "rules": [],
      "default": {
        "fixed_target": 10,
        "rate": 0.05
      },
      "version": 1
    }

Order of priority is determined by the spot in the rules array, top being highest priority. The default is always checked last.
Service name, URL path and HTTP method patterns are case insensitive, and use a string with wild cards as the pattern format.
A '*' represents any number of characters, while '?' represents a single character.
Description is optional.

    {
      "rules": [
        {
          "description": "Sign-in request",
          "http_method": "GET",
          "service_name": "*.foo.com",
          "url_path": "/signin/*",
          "fixed_target": 10,
          "rate": 0.05
        }
      ],
      "default": {
        "fixed_target": 10,
        "rate": 0.05
      },
      "version": 1
    }

#### dynamic and fixed naming modes

The SDK requires a default segment name to be set when using middleware. If it is not set, an error will be
thrown. This value can be overridden via the AWS_XRAY_TRACING_NAME environment variable.

    app.use(AWSXRay.express.openSegment('defaultName'));

The SDK defaults to a fixed naming mode. This means that each time a new segment is created for an incoming request,
the name of that segment is set to the default name.

In dynamic mode, the segment name can vary between the host header of the request or the default name.

    AWSXRay.middleware.enableDynamicNaming(<pattern>);

If no pattern is provided, the host header is used as the segment name. If no host header is present, the default is used.
This is equivalent to using the pattern '*'.

If a pattern is provided, in the form of a string with wild cards (ex: '*.*.us-east-?.elasticbeanstalk.com') then the host header of the
request will be checked against it. A '*' represents any number of characters, while '?' represents a single character. If the host
header is present and matches this pattern, it is used as the segment name. Otherwise, the default name is used.

### partial subsegment streaming and the streaming threshold

By default, the SDK is configured to have a threshold of 100 subsegments per segment. This is because the UDP packet maximum size is ~65 kb, and
larger segments may trigger the 'Segment too large to send' error.

To remedy this, the SDK will automatically send the completed subsegments to the daemon when the threshold has been breached.
Additionally, subsegments that complete when over threshold automatically send themselves.  If a subsegment is sent out-of-band, it
will be pruned from the segment object. The full segment will be reconstructed on the service-side. You can change the threshold as needed.

    AWSXRay.setStreamingThreshold(10);

Subsegments may be marked as 'in_progress' when sent to the daemon. The SDK is telling the service to anticipate the asynchronous subsegment
to be received out-of-band when it has completed. When received, the in_progress subsegment will be discarded in favor of the completed subsegment.

### developing custom solutions using automatic mode

Automatic mode is for use with the aws-xray-sdk-express module to support Express applications, however can be utilized outside of this.
If your application is not using the Express middleware, you will have to create the new segment and set this on the SDK.

    var segment = new AWSXRay.Segment(name, [optional root ID], [optional parent ID]);
    AWSXRay.setSegment(segment);

If you are using a different web framework and would like to setup automatic capturing, the X-Ray SDK provides helper functions under AWSXRay.middleware.
Please see the AWSXRay.middleware documentation and the aws-xray-sdk-express module for more information.

If you are writing your own capture mechanism or middleware, you will need to create a new level of CLS, you can do so by using the CLS namespace object.
We expose this via the following.

    AWSXRay.getNamespace();

For additional information and examples using the CLS namespace to create a new context, please see: https://github.com/othiym23/node-continuation-local-storage

## Example code

### version capturing

    Use the 'npm start' script to enable.

### capture all incoming HTTP requests to '/'

    var app = express();

    //...

    var AWSXRay = require('aws-xray-sdk');

    app.use(AWSXRay.express.openSegment('defaultName'));               //required at the start of your routes

    app.get('/', function (req, res) {
      res.render('index');
    });

    app.use(AWSXRay.express.closeSegment());   //required at the end of your routes / first in error handling routes

### capture all outgoing AWS requests

    var AWS = captureAWS(require('aws-sdk'));

    //create new clients as per usual
    //make sure any outgoing calls that are dependent on another async
    //function are wrapped with captureAsyncFunc, otherwise duplicate segments may leak
    //see usages for clients in manual and automatic modes

### configure AWSXRay to automatically capture EC2 instance data

    var AWSXRay = require('aws-xray-sdk');
    AWSXRay.config([AWSXRay.plugins.EC2Plugin]);

### add annotations

    var key = 'hello';
    var value = 'there';        // must be string, boolean or finite number

    subsegment.addAnnotation(key, value);

### add metadata

    var key = 'hello';
    var value = 'there';

    subsegment.addMetadata(key, value);
    subsegment.addMetadata(key, value, 'greeting');   //custom namespace

### create new subsegment

    var newSubseg = subsegment.addNewSubsegment(name);

    // or

    var subsegment = new Subsegment(name);

## Automatic mode examples

Automatic mode is for use with the aws-xray-sdk-express module to support Express applications, however it can be utilized outside of this.
If the Express middleware is not being used, you'll have to create a root segment and set on the SDK via the following:

    var segment = new AWSXRay.Segment(name, [optional root ID], [optional parent ID]);
    AWSXRay.setSegment(segment);

Only then will the segment be available for use in automatic mode and can be picked up by the capture functions and other aws-xray-sdk modules.

### capture all incoming HTTP requests to '/'

    var app = express();

    //...

    var AWSXRay = require('aws-xray-sdk');

    app.use(AWSXRay.express.openSegment('defaultName'));

    app.get('/', function (req, res) {
      res.render('index');
    });

    app.use(AWSXRay.express.closeSegment());

### capture through function calls

    var AWSXRay = require('aws-xray-sdk');

    app.use(AWSXRay.express.openSegment('defaultName'));

    //...

    //the root segment is created by the Express middleware
    //this creates 5 nested subsegments on the root segment
    //and captures timing data individually for each subsegment

    app.get('/', function (req, res) {
      captureFunc('1', function(subsegment1) {
        //exposing the subsegment in the function is optional, it is listed here as an example
        //you can also use
        //var subsegment1 = AWSXRay.getSegment();

        captureFunc('2', function(subsegment2) {
          captureFunc('3', function(subsegment3) {
            captureFunc('4', function(subsegment4) {
              captureFunc('5', function() {
                //exposing the subsegment is optional
                res.render('index');
              });
            });
          });
        });
      });
    });

    app.use(AWSXRay.express.closeSegment());

### capture through async function calls

    var AWSXRay = require('aws-xray-sdk');

    //...

    app.use(AWSXRay.express.openSegment('defaultName'));

    app.get('/', function (req, res) {
      var host = 'samplego-env.us-east-1.elasticbeanstalk.com';

      AWSXRay.captureAsyncFunc('send', function(subsegment) {
        //'subsegment' here is the newly created and exposed subsegment for the async
        //request, and must be closed manually (this ensures timing data is correct)

        sendRequest(host, function() {
          console.log("rendering!");
          res.render('index');
          subsegment.close();
        });
      });
    });

    app.use(AWSXRay.express.closeSegment());

    function sendRequest(host, cb) {
      var options = {
        host: host,
        path: '/',
      };

      var callback = function(response) {
        var str = '';

        response.on('data', function (chunk) {
          str += chunk;
        });

        response.on('end', function () {
          cb();
        });
      }

      http.request(options, callback).end();
    };

### capture outgoing AWS requests on a single client

    var s3 = AWSXRay.captureAWSClient(new AWS.S3());

    //use client as usual
    //make sure any outgoing calls that are dependent on another async
    //function are wrapped with captureAsyncFunc, otherwise duplicate segments may leak

### capture outgoing AWS requests on every AWS SDK client

    var aws = AWSXRay.captureAWS(require('aws-sdk'));

    //create new clients as per usual
    //make sure any outgoing calls that are dependent on another async
    //function are wrapped with captureAsyncFunc, otherwise duplicate segments may leak

### capture all outgoing HTTP/S requests

    var tracedHttp = AWSXRay.captureHTTPs(require('http'));     //returns a copy of the http module that is patched, can patch https as well.

    var options = {
      ...
    }

    tracedHttp.request(options, callback).end();

    //create new requests as per usual
    //make sure any outgoing calls that are dependent on another async
    //function are wrapped with captureAsyncFunc, otherwise duplicate segments may leak

## Manual mode examples

Enable manual mode:

    AWSXRay.enableManualMode();

### capture through function calls

    var AWSXRay = require('aws-xray-sdk');

    app.use(AWSXRay.express.openSegment('defaultName'));

    //...

    //the root segment is created by the Express middleware
    //this creates 5 nested subsegments on the root segment
    //and captures timing data individually for each subsegment

    app.get('/', function (req, res) {
      var segment = req.segment;

      captureFunc('1', function(subsegment1) {
        captureFunc('2', function(subsegment2) {
          captureFunc('3', function(subsegment3) {
            captureFunc('4', function(subsegment4) {
              captureFunc('5', function() {
                //subsegment need not be exposed here since we're not doing anything with it

                res.render('index');
              }, subsegment4);
            }, subsegment3);
          }, subsegment2);
        }, subsegment1);
      }, segment);
    });

    app.use(AWSXRay.express.closeSegment());

### capture through async function calls

    var AWSXRay = require('aws-xray-sdk');

    AWSXRay.enableManualMode();

    app.use(AWSXRay.express.openSegment('defaultName'));

    app.get('/', function (req, res) {
      var segment = req.segment;
      var host = 'samplego-env.us-east-1.elasticbeanstalk.com';

      AWSXRay.captureAsyncFunc('send', function(subsegment) {
        sendRequest(host, function() {
          console.log("rendering!");
          res.render('index');
          subsegment.close();
        }, subsegment);
      }, segment);
    });

    app.use(AWSXRay.express.closeSegment());

    function sendRequest(host, cb, subsegment) {
      var options = {
        host: host,
        path: '/',
        XRaySegment: subsegment            //required 'XRaySegment' param
      };

      var callback = function(response) {
        var str = '';

        //the whole response has been received, so we just print it out here
        //another chunk of data has been received, so append it to `str`
        response.on('data', function (chunk) {
          str += chunk;
        });

        response.on('end', function () {
          cb();
        });
      }

      http.request(options, callback).end();
    };

### capture outgoing AWS requests on a single client

    var s3 = AWSXRay.captureAWSClient(new AWS.S3());
    var params = {
      Bucket: bucketName,
      Key: keyName,
      Body: 'Hello!',
      XRaySegment: subsegment             //required 'XRaySegment' param
    };

    s3.putObject(params, function(err, data) {
      ...
    });

### capture all outgoing AWS requests

    var AWS = captureAWS(require('aws-sdk'));

    //create new clients as per usual
    //make sure any outgoing calls that are dependent on another async
    //functions are wrapped, otherwise duplicate segments may leak.

### capture all outgoing HTTP/S requests

    var tracedHttp = AWSXRay.captureHTTPs(require('http'));     //returns a copy of the http module that is patched, can patch https as well.

    ...

    //include sub/segment reference in options as 'XRaySegment'
    var options = {
      ...
      XRaySegment: subsegment             //required 'XRaySegment' param
    }

    tracedHttp.request(options, callback).end();
