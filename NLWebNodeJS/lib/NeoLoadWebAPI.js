const Promise = require('promise');
//const rp = require('request-promise');
const fetch = require('cross-fetch');
const Swagger = require('swagger-client');

var url = require('url');
var http = require('http');
var HttpProxyAgent = require('http-proxy-agent');
var HttpsProxyAgent = require('https-proxy-agent');

module.exports = {
  id: "NeoLoadWebAPI",
  create: function(apiKey,host) {
    return new NLWAPI(apiKey,host);
  }
};

function NLWAPI(apiKey,host) {
  this.https = true;
  this.host = host ? host : "neoload-api.saas.neotys.com";
  this.apiKey = apiKey;
  this.proxySpec = null;

  this.getApiKey = function() { return this.apiKey; }
  this.setApiKey = function(newApiKey) { this.apiKey = newApiKey; return this; }

  this.getBaseUrl = function() {
    return "http" + (this.https ? "s" : "") + "://" + this.host + "/v1/";
  };
  this.proxy = function(serverSpec) {
    this.proxySpec = serverSpec;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = ((this.proxySpec != null) ? "0" : "1");
  }

  this.getClient = function() {
    return Swagger("http"+(this.https ? "s" : "")+"://"+this.host+"/explore/swagger.yaml", {
      userFetch: (url, opts) => {
        var o = opts ? opts : {};
        if (this.proxySpec != null)
          o.agent = new HttpsProxyAgent(this.proxySpec);
        return fetch(url, o);
      },
      requestInterceptor: (req) => {
        req.headers['accountToken'] = this.getApiKey();
        if (this.proxySpec != null)
          req.agent = new HttpsProxyAgent(this.proxySpec);
      },
      responseInterceptor: (res) => {
        //console.log(res);
      }
    });
  };

  this.createOptions = function(url) {
    return {
      uri: url,
      headers: { 'accountToken' : this.apiKey },
      json: true
    };
  }

  this.tests = function() {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTests({limit: 50, pretty: true});
    });
  }

  this.elements = function(test,category) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestElements({ testId: test.id, category: category });
    }).then(res => {
      return res.body.map(el => {
        el.testId = test.id;
        el.testName = test.name;
        return el;
      });
    });
  }

  this.REQUEST_FIELDS = 'AVG_DURATION,MIN_DURATION,MAX_DURATION,COUNT,THROUGHPUT,ELEMENTS_PER_SECOND,ERRORS,ERRORS_PER_SECOND,ERROR_RATE,AVG_TTFB,MIN_TTFB,MAX_TTFB'.split(',');

  this.points = function(element) {
    return this.getClient().then(cli => {
      return cli.apis.Results.GetTestElementsPoints({
        testId: element.testId,
        elementId: element.id,
        statistics: this.REQUEST_FIELDS.join(',')
      }).then(set => {
        return set.body.map(line => {
          line.testId = element.testId;
          line.testName = element.testName;
          line.elementId = element.id;
          line.elementName = element.name;
          return line;
        })
      });
    });
  }
}
