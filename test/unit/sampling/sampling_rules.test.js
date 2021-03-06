var assert = require('chai').assert;
var chai = require('chai');
var fs = require('fs');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');

chai.should();
chai.use(sinonChai);

var SamplingRules = require('../../../lib/middleware/sampling/sampling_rules');
var Sampler = require('../../../lib/middleware/sampling/sampler');
var Utils = require('../../../lib/utils');

describe('SamplingRules', function() {
  var sandbox, stubIsSampled;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    stubIsSampled = sandbox.stub(Sampler.prototype, 'isSampled').returns(true);
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('#constructor', function() {
    var sandbox;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      sandbox.stub(Sampler.prototype, 'init').returns();
    });

    afterEach(function() {
      sandbox.restore();
    });

    describe('by default', function() {
      it('should return a SamplingRules object loaded with the default JSON document', function() {
        var samplingRules = new SamplingRules();

        assert(samplingRules);
        assert.isTrue(samplingRules.rules[0].default);
      });
    });

    describe('by supplying a config file', function() {
      var jsonDoc = {
        rules: [
          {
            description: 'moop',
            http_method: 'GET',
            service_name: '*.foo.com',
            url_path: '/signin/*',
            fixed_target: 0,
            rate: 0
          },
          {
            description: '',
            http_method: 'POST',
            service_name: '*.moop.com',
            url_path: '/login/*',
            fixed_target: 10,
            rate: 0.05
          }
        ],
        default: {
          fixed_target: 10,
          rate: 0.05
        },
        version: 1
      };

      beforeEach(function() {
        sandbox = sinon.sandbox.create();
      });

      afterEach(function() {
        sandbox.restore();
      });

      it('should parse the matchers rules', function() {
        sandbox.stub(fs, 'readFileSync').returns();
        sandbox.stub(JSON, 'parse').returns(jsonDoc);

        var samplingRules = new SamplingRules('/path/here');
        var rule0 = samplingRules.rules[0];
        var rule1 = samplingRules.rules[1];
        var rule2 = samplingRules.rules[2];

        assert.equal(rule0.service_name, jsonDoc.rules[0].service_name);
        assert.equal(rule0.http_method, jsonDoc.rules[0].http_method);
        assert.equal(rule0.url_path, jsonDoc.rules[0].url_path);
        assert.instanceOf(rule0.sampler, Sampler);

        assert.equal(rule1.service_name, jsonDoc.rules[1].service_name);
        assert.equal(rule1.http_method, jsonDoc.rules[1].http_method);
        assert.equal(rule1.url_path, jsonDoc.rules[1].url_path);
        assert.instanceOf(rule1.sampler, Sampler);

        assert.isTrue(rule2.default);
        assert.instanceOf(rule2.sampler, Sampler);
      });
    });

    it('should throw an error if the file is missing a "version" attribute', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({ rules: [] });

      assert.throws(function () { new SamplingRules(); }, 'Missing "version" attribute.');
    });

    it('should throw an error if the file the version is not valid', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({ rules: [], version: 'moop' });

      assert.throws(function () { new SamplingRules(); }, 'Unknown version "moop".');
    });

    it('should throw an error if the file is missing a "default" object', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({ rules: [], version: 1 });

      assert.throws(function () { new SamplingRules(); },
        'Expecting "default" object to be defined with attributes "fixed_target" and "rate".');
    });

    it('should throw an error if the "default" object contains an invalid attribute', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({ default: { fixed_target: 10, rate: 0.05, url_path: '/signin/*' }, version: 1});

      assert.throws(function () { new SamplingRules(); },
        'Invalid attributes for default: url_path. Valid attributes for default are "fixed_target" and "rate".');
    });

    it('should throw an error if the "default" object is missing required attributes', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({ default: { fixed_target: 10 }, version: 1});

      assert.throws(function () { new SamplingRules(); }, 'Missing required attributes for default: rate.');
    });

    it('should throw an error if any rule contains invalid attributes', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({
        rules: [{
          service_name: 'www.worththewait.io',
          http_method: 'PUT',
          url_path: '/signin/*',
          moop: 'moop',
          fixed_target: 10,
          rate: 0.05
        }],
        default: {
          fixed_target: 10,
          rate: 0.05
        },
        version: 1
      });

      assert.throws(function () { new SamplingRules(); }, 'has invalid attribute: moop.');
    });

    it('should throw an error if any rule is missing required attributes', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({
        rules: [{
          url_path: '/signin/*',
          fixed_target: 10,
          rate: 0.05
        }],
        default: {
          fixed_target: 10,
          rate: 0.05
        },
        version: 1
      });

      assert.throws(function () { new SamplingRules(); }, 'is missing required attributes: service_name,http_method.');
    });

    it('should throw an error if any rule attributes have an invalid value', function() {
      sandbox.stub(fs, 'readFileSync');
      sandbox.stub(JSON, 'parse').returns({
        rules: [{
          service_name: 'www.worththewait.io',
          http_method: null,
          url_path: '/signin/*',
          fixed_target: 10,
          rate: 0.05
        }],
        default: {
          fixed_target: 10,
          rate: 0.05
        },
        version: 1
      });

      assert.throws(function () { new SamplingRules(); }, 'attribute "http_method" has invalid value: null.');
    });
  });

  describe('#shouldSample', function() {
    var sandbox, fakeSampler;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      fakeSampler = new Sampler(10, 0.05);
    });

    afterEach(function() {
      sandbox.restore();
    });

    it('should match the default rule and return true', function() {
      var samplingRules = new SamplingRules();
      samplingRules.rules = [{
        default: true,
        sampler: fakeSampler
      }];

      assert.isTrue(samplingRules.shouldSample('hello.moop.com', 'GET', '/home/moop/hello'));
      stubIsSampled.should.have.been.calledOnce;
    });

    it('should match the customer rule by calling Utils.wildcardMatch on each attribute', function() {
      var matchStub = sandbox.stub(Utils, 'wildcardMatch').returns(true);

      var samplingRules = new SamplingRules();
      samplingRules.rules = [{
        http_method: 'POST',
        service_name: '*.moop.com',
        url_path: '/login/*',
        sampler: fakeSampler
      }];

      samplingRules.shouldSample('hello.moop.com', 'POST', '/login/moop/hello');
      stubIsSampled.should.have.been.calledOnce;

      matchStub.should.have.been.calledThrice;
      matchStub.should.have.been.calledWithExactly('/login/*', '/login/moop/hello');
      matchStub.should.have.been.calledWithExactly('POST', 'POST');
      matchStub.should.have.been.calledWithExactly('*.moop.com', 'hello.moop.com');
    });

    it('should fail to match the customer rule and not call isSampled', function() {
      sandbox.stub(Utils, 'wildcardMatch').returns(false);

      var samplingRules = new SamplingRules();
      samplingRules.rules = [{
        http_method: '.',
        service_name: '.',
        url_path: '.',
        sampler: fakeSampler
      }];

      assert.isFalse(samplingRules.shouldSample('hello.moop.com', 'GET', '/login/moop/hello'));
      stubIsSampled.should.not.have.been.called;
    });
  });
});
