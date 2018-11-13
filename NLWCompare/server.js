const NLWAPI = require('./lib/NeoLoadWebAPI.js')
const argv = require("yargs").argv;
const express = require('express'),
  app = express(),
  port = argv.port || 3000,
  path = require('path'),
  bodyParser = require('body-parser')

/*
  // Setup View Engine
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs'); //specifies the engine we want to use
  app.engine('html', require('ejs').renderFile); //renders files with html extension

  // Set Static Folder
  app.use('/node_modules', express.static(__dirname + '/node_modules'));
  app.use('/styles', express.static(__dirname + '/styles'));
  app.use('/client', express.static(__dirname + '/client'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));

  app.use('/', index); //sets our home page route
  app.use('/compare', index); //sets our home page route
*/

app.use('/static', express.static(__dirname + '/static'));

const json2csv = require('json2csv');
const HashMap = require('hashmap');

console.log('NeoLoad flattener RESTful API server started on: ' + port);

//app.use(bodyParser.urlencoded({ extended: true }));
//app.use(bodyParser.json());

var nlwapikey = argv.apikey || process.env.npm_config_apikey || process.env.NLWAPIKEY;
var nlwapihost = argv.host || process.env.npm_config_host || process.env.NLWAPIHOST;
var nlwapissl = argv.ssl || process.env.npm_config_ssl || process.env.NLWAPISSL;

var proxy = argv.proxy;

if(!nlwapikey) { throw new Error("You must define your NeoLoad Web API key, either as a system environment variable called 'NLWAPIKEY' or as the 'apikey' argument."); }

var nlw = NLWAPI.create(nlwapikey, nlwapihost, nlwapissl);
if(proxy) nlw.proxy(proxy);

console.log('Waiting for client connections...')

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Connection","close")
  next();
});


app.route('/api/comparison')
  .get(function(req, res) {
    var baseId = req.query.baseline;
    var candId = req.query.candidate;

    var body = {
      baseId: baseId,
      candId: candId,
      baselineSummary: {},
      candidateSummary: {},
      topTransactions: {},
      topRequests: {},
      errorsByRequest: {},
      /*
      violations: [
        { violationType: "OS" },
        { violationType: "WebLogic" },
        { violationType: "JMX" }
      ],*/
      transactionVariances: {}/*,
      requests: {}*/
    };

    Promise.all([
      promiseTestStatistics(baseId).then(o => {
        body.baselineSummary = o
      }),
      promiseTestStatistics(candId).then(o => {
        body.candidateSummary = o
      }),
      promiseErrorsByRequest(baseId,candId).then(o => {
        body.errorsByRequest = o
      }),
      promiseTransactionVariances(baseId,candId).then(o => {
        body.transactionVariances = o
      }),
      promiseTopRequests(baseId,candId).then(o => {
        body.topRequests = o
      })
      /*,
      promiseRequestDetails(baseId,candId).then(o => {
        body.requests = o
      })
      */
    ]).then(r => {
      // greedy grab all transaction data to calculate percentiles before summarizing
      return promiseTopTransactions(baseId,candId).then(o => {
        body.topTransactions = o
      })
    })
    .then(r => {
      res.json(body);
    })
  });


  app.route('/report')
    .get(function(req, res) {
      res.sendFile(path.join(__dirname + '/static/report.template.html'))
    });


  app.route('/api/shortSummary')
    .get(function(req, res) {
      promiseTestStatistics(req.query.test).then(o => {
        res.json(o)
      });
    });
  function promiseTestStatistics(testId) {
    return nlw.test(testId).then(r => {
      var info = r.body;
      return info;
    }).then(info => {
      return nlw.testStatistics(testId).then(r => {
        var stats = r.body;
        var ext = {
          transactionsPerSecond: stats.totalTransactionCountPerSecond,
          averageResponseTime: stats.totalRequestDurationAverage,
          throughput: (stats.totalGlobalDownloadedBytesPerSecond / (1 * 1000 * 1000) * 8),
          errorCount: stats.totalGlobalCountFailure
        };
        for(var k in stats) info[k]=stats[k];
        for(var k in ext) info[k]=ext[k];
        return info;
      })
    })
  }


  var agg_trans = new HashMap();
  var agg_requests = new HashMap();
  var request_values = new HashMap();
  var request_points = new HashMap();

  app.route('/api/topTransactions')
    .get(function(req, res) {
      var baseId = req.query.baseline;
      var candId = req.query.candidate;
      promiseTopTransactions(baseId,candId).then(o => {
        res.json(o)
      });
    });
  function promiseTopTransactions(baseId,candId) {
    return fillTransactions(baseId,candId,agg_trans)
    .then(r => {
      return agg_trans.values().filter(v => { return v != null; })
                .filter(v => { return v != null && v.varianceInPercentile > 0; })
                .sort(function(a,b) { return b.varianceInPercentile - a.varianceInPercentile})
                .slice(0,5)
    })
  }

  function promiseTransactionVariances(baseId,candId) {
    return fillTransactions(baseId,candId,agg_trans)
    .then(r => {
      return agg_trans.values().filter(v => { return v != null; })
                .sort(function(a,b) { return b.varianceInPercentile - a.varianceInPercentile})
    })
  }

  function fillTransactions(baseId,candId,agg) {
    return Promise.all([

      nlw.elements({ id: baseId },'TRANSACTION').then(rs => {
        stowTransactions(agg,rs,function(el,tran) {
          tran.baselineTestId = baseId;
          tran.baselineElementId = el.id;
        })
      }),

      nlw.elements({ id: candId },'TRANSACTION').then(rs => {
        stowTransactions(agg,rs,function(el,tran) {
          tran.candidateTestId = candId;
          tran.candidateElementId = el.id;
        })
      })

    ])/*.then(r => {
      return getOrFillRequests(baseId,candId)
        .then(r => {
          console.log('here is where we fill transaction percentiles')
        })
    })*/
    /*.then(r => {
      return Promise.all(
        agg.values().filter(v => { return v != null; })
        .map(entry => {
          return Promise.all([
            nlw.values({ test: { id: baseId }, id: entry.baselineElementId }).then(r => {
              //entry.baselineValues = r;
              entry.baselineValue = r.avgDuration;
            }),
            nlw.values({ test: { id: candId }, id: entry.candidateElementId }).then(r => {
              //entry.candidateValues = r;
              entry.candidateValue = r.avgDuration;
            })
          ])
        })
      )
    })*/
  }

  function stowTransactions(agg,rs,funcSetValues) {
    var results = rs.filter(r => { return r.id != 'all-transactions' });
    for(var i=0; i<results.length; i++) {
      var el = results[i];
      var key = el.path.join('|');
      var tran;
      if(agg.has(key))
        tran = agg.get(key);
      else {
        tran = {
          path: key,
          transactionName: el.name
        }
      }
      funcSetValues(el,tran);
      agg.set(key,tran);
    }
  }



  function promiseTopRequests(baseId,candId) {
    var prom = getOrFillRequests(baseId,candId);
    return prom
    .then(r => {
      return agg_requests.values()
              .filter(v => { return v != null && v.varianceInPercentile > 0; })
              .sort(function(a,b) {
                return b.varianceInPercentile - a.varianceInPercentile
               })
              .slice(0,5)
    })
  }
  function promiseRequestDetails(baseId,candId) {
    var prom = getOrFillRequests(baseId,candId);
    return prom
    .then(r => {
      return agg_requests.values()
              .filter(v => { return v != null; })
              .sort(b.path)
              .slice(0,5)
    })
  }


  app.route('/api/errorsByRequest')
    .get(function(req, res) {
      var baseId = req.query.baseline;
      var candId = req.query.candidate;
      promiseErrorsByRequest(baseId,candId).then(o => {
        console.log('writing')
        res.json(o)
      });
    });
  var agg_requests = new HashMap();
  function promiseErrorsByRequest(baseId,candId) {
    var prom = getOrFillRequests(baseId,candId);
    return prom
    .then(r => {
      return agg_requests.values()
              .filter(v => { return v != null && v.varianceInFailureCount > 0; })
              .sort(function(a,b) { return b.varianceInFailureCount - a.varianceInFailureCount })
              .slice(0,5)
    })
  }

  function getOrFillRequests(baseId,candId) {
    var agg = agg_requests;
    if(agg.count() > 0) {
      console.log('superfluous')
      return Promise.resolve();
    } else {
      return Promise.all([

        getRelevantRequestElements(baseId).then(rs => {
          stowRequests(agg,rs,function(el,req) {
            req.baselineTestId = baseId;
            req.baselineElementId = el.id;
          })
        }),

        getRelevantRequestElements(candId).then(rs => {
          stowRequests(agg,rs,function(el,req) {
            req.candidateTestId = candId;
            req.candidateElementId = el.id;
          })
        })

      ]).then(r => {
        //console.log((agg.values().map(e => (e != undefined && e != null ? e.path : ''))).join('\r\n'))
        return Promise.all(
          agg_requests.values().filter(v => { return v != null; })
          .map(entry => {
            return Promise.all([
              nlw.values({ test: { id: baseId }, id: entry.baselineElementId }).then(r => {
                request_values.set(baseId+entry.baselineElementId, r);
                entry.baselineFailureCount = r.failureCount;
                entry.baselineAverageDuration = r.avgDuration;
              }),
              nlw.values({ test: { id: candId }, id: entry.candidateElementId }).then(r => {
                request_values.set(candId+entry.baselineElementId, r);
                entry.candidateFailureCount = r.failureCount;
                entry.candidateAverageDuration = r.avgDuration;
              }),
              nlw.points({ test: { id: baseId }, id: entry.baselineElementId },0,'AVG_DURATION').then(r => {
                request_points.set(baseId+entry.baselineElementId, r);
                //entry.baselineValue = r.avgDuration;
              }),
              nlw.points({ test: { id: candId }, id: entry.candidateElementId },0,'AVG_DURATION').then(r => {
                request_points.set(candId+entry.candidateElementId, r);
                //entry.candidateValue = r.avgDuration;
              })
            ])
          })
        )
      }).then(r => {
        agg_requests.values().filter(v => { return v != null; })
        .map(entry => {
          entry.varianceInFailureCount = (entry.baselineFailureCount != 0 ? (entry.candidateFailureCount / entry.baselineFailureCount) - 1.0 : 0);
          entry.varianceInAverageDuration = (entry.baselineAverageDuration != 0 ? (entry.candidateAverageDuration / entry.baselineAverageDuration) - 1.0 : 0);
        })
      }).then(r => {
        agg_trans.values().filter(v => { return v != null; })
        .map(tran => {
          var baseAll = [];
          var candAll = [];
          var reqs = agg_requests.values().filter(v => { return v != null; })
              .filter(req => (
                  (req.path.indexOf(tran.path) > -1)
                  && (
                    true ||
                    (req.baselineTestId==tran.baselineTestId)
                    ||
                    (req.candidateTestId==tran.candidateTestId)
                  )
                )
              ).map(req => {
                var keys = request_points.keys();
                var baseValues = keys.filter(v => { return v != null; })
                      .filter(key => (
                        (key == (req.baselineTestId+req.baselineElementId))
                      ))
                      .map(key => request_points.get(key))
                var candValues = keys.filter(v => { return v != null; })
                      .filter(key => (
                        (key == (req.candidateTestId+req.candidateElementId))
                      ))
                      .map(key => request_points.get(key))
                //req.baseValues = baseValues;
                if(baseValues.length != 1) console.error('baseValues is not a 1-sized array!!!')
                if(candValues.length != 1) console.error('candValues is not a 1-sized array!!!')
                baseAll = baseAll.concat(baseValues[0])
                candAll = candAll.concat(candValues[0])
                req.basePercentile = calcPercentile(baseValues[0])
                req.candPercentile = calcPercentile(candValues[0])
                req.varianceInPercentile = (req.basePercentile != 0 ? (req.candPercentile / req.basePercentile) - 1.0 : 0);
                return req;
              });
          //tran.requests = reqs;
          tran.basePercentile = calcPercentile(baseAll)
          tran.candPercentile = calcPercentile(candAll)
          tran.varianceInPercentile = (tran.basePercentile != 0 ? (tran.candPercentile / tran.basePercentile) - 1.0 : 0);
          if(baseAll.length < 1)
            console.error('tran['+tran.path+'] has no values, but '+reqs.length+' requests')
        })
      })
    }
  }

  function calcPercentile(arr) {
    if(arr == undefined || arr == null || !Array.isArray(arr)) {
      console.log('bad array passed to calcPercentile: ' + JSON.stringify(arr))
      return 0;
    }
    else {
      if(arr.length < 1)
        return 0;
      else {
        var values = arr.map(o => o.AVG_DURATION);
        return get_percentile(90,values)
      }
    }
  }

  function get_percentile($percentile, $array) {
      $array.sort()
      $index = ($percentile/100) * $array.length;
      if (Math.floor($index) == $index) {
           $result = ($array[$index-1] + $array[$index])/2;
      }
      else {
          $result = $array[Math.floor($index)];
      }
      return $result;
  }

  function getRelevantRequestElements(testId) {
    return nlw.elements({ id: testId },'REQUEST')
        .then(els => {
          return els.filter(el => {
            return (el.path && Array.isArray(el.path) && isStaticFileExtension(el.path[el.path.length-1]) ? false : true);
          })
        })
  }
  function isStaticFileExtension(namePart) {
    if(namePart && namePart.length > 0) {
      var parts = namePart.split('.');
      var last = parts[parts.length-1].toLowerCase();
      switch(last) {
        case "css":
        case "js":
        case "woff":
        case "jpg":
        case "jpeg":
        case "gif":
        case "png":
        case "ico":
        case "jar":
        case "swf":
        case "svg":
          return true;
      }
    }
    return false;
  }

  function stowRequests(agg,rs,funcSetValues) {
    var results = rs.filter(r => { return r.id != 'all-requests' });
    for(var i=0; i<results.length; i++) {
      var el = results[i];
      var key = el.path.join('|');
      var req;
      if(agg.has(key))
        req = agg.get(key);
      else {
        req = {
          path: key,
          transactionName: el.name
        }
      }
      funcSetValues(el,req);
      agg.set(key,req);
    }
  }

































function writePoints(req, res, category) {
  var agg_tests = new HashMap();
  var agg_elements = new HashMap();
  var since = parseInt(req.query.since || -1);
  filterTests(req)
    .then(tests => {
      return Promise.all(
        tests
          .map(test => {
            agg_tests.set(test.id,test);
            return nlw.elements(test,category)
            .then(els => els.filter(el => (el.id+"").indexOf("all-")<0));
          }

      ))
    }).then(o => [].concat.apply([], o)) // squash test elements together
    .then(els => {
      return Promise.all(
        els.map(el => {
          agg_elements.set(el.id, el);
          return nlw.points(el, since);
        })
      )
    }).then(o => [].concat.apply([], o)) // squash element request values
    .then(o => {
      var simplified = o.map(i => {
        i.from = new Date(i.test.startDate + i.from);
        i.to = new Date(i.test.startDate + i.to);
        return i;
      })
      if(isCSV(req))
      {
        simplified = simplified.map(i => {
          i.category = category;
          i.test = i.test.name;
          i.element = i.element.name;
          return i;
        })
        res.send(json2csv({ data: o, fields: ['from','to','test','element','category'].concat(nlw.REQUEST_FIELDS) }));
      }
      else {
        simplified = simplified.map(i => {
          i.test = i.test.id;
          i.element = i.element.id;
          return i;
        });
        res.json({
          category: category,
          tests: agg_tests.values().filter(v => v != null),
          elements: agg_elements.values().filter(v => v != null),
          metadata: {
            pointCount: simplified.length
          },
          points: simplified
        });
      }
    });
}

function isCSV(req) {
  return ((req.query.format+"").toLowerCase() == "csv");
}

function filterTests(req, allowNoFilter) {
  var nameOrId = req.query.test;
  var status = req.query.status;
  var allowNoFilter = (allowNoFilter != undefined ? allowNoFilter==true : false);
  if((!nameOrId && !status) && !allowNoFilter)
    throw new Error("You must specify a test filter to use this operation.")
  if((status+"").toLowerCase() == "terminated")
    throw new Error("Filtering on status=terminated would produce too much data.")
  return nlw.tests().then(r => {
    var tests = r.body;
    if(status) tests = tests.filter(function(test) {
      return (
          (test.status+"").toLowerCase() == (status+"").toLowerCase()
          ||
          (test.qualityStatus+"").toLowerCase() == (status+"").toLowerCase()
      );
     });
    if(nameOrId) tests = tests.filter(function(test) {
      var endDate = parseInt(test.endDate || 0);
      return (
        (test.name+"").toLowerCase().indexOf((nameOrId+"").toLowerCase()) > -1
        ||
        (test.id+"").toLowerCase() == (nameOrId+"").toLowerCase()
      );
    });
    return tests;
  });
}
Object.prototype.renameProperty = function (oldName, newName) {
     // Do nothing if the names are the same
     if (oldName == newName) {
         return this;
     }
    // Check for the old property name to avoid a ReferenceError in strict mode.
    if (this.hasOwnProperty(oldName)) {
        this[newName] = this[oldName];
        delete this[oldName];
    }
    return this;
};
app.listen(port);
