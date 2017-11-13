const NLWAPI = require('./lib/NeoLoadWebAPI.js')
const argv = require("yargs").argv;
const express = require('express'),
  app = express(),
  port = argv.port || 3000,
  bodyParser = require('body-parser');

const json2csv = require('json2csv');
const HashMap = require('hashmap');

console.log('NeoLoad flattener RESTful API server started on: ' + port);

//app.use(bodyParser.urlencoded({ extended: true }));
//app.use(bodyParser.json());

var nlwapikey = argv.apikey || process.env.NLWAPIKEY;
var proxy = argv.proxy;

if(!nlwapikey) { throw new Error("You must define your NeoLoad Web API key, either as a system environment variable called 'NLWAPIKEY' or as the 'apikey' argument."); }

var nlw = NLWAPI.create(nlwapikey, argv.host);
if(proxy) nlw.proxy(proxy);

console.log('Available operations from http://localhost:' + port)
console.log(' - /tests')
console.log(' - /transactions')
console.log(' - /pages')
console.log(' - /requests')
console.log('')
console.log('Filters: test=(partial test name or test id)')
console.log('')
console.log('Examples:')
console.log('   curl http://localhost:'+port+'/tests')
console.log('   curl http://localhost:'+port+'/transactions?test=AutomatedTest&format=csv')
console.log('   curl http://localhost:'+port+'/transactions?test=a3d00789-67c1-4986-b422-f10309f7e7d3&format=csv')
console.log('')
console.log('Waiting for client connections...')


app.route('/tests')
  .get(function(req, res) {
    filterTests(req, true)
      .then(tests => {
        if(isCSV(req))
          res.send(json2csv({data: tests}));
        else
          res.json({
            tests: tests
          });
    });
  });

app.route('/transactions')
  .get(function(req, res) {
    writePoints(req, res, 'TRANSACTION');
  });

app.route('/pages')
  .get(function(req, res) {
    writePoints(req, res, 'PAGE');
  });

app.route('/requests')
  .get(function(req, res) {
    writePoints(req, res, 'REQUEST');
  });

function writePoints(req, res, category) {
  var agg_tests = new HashMap();
  var agg_elements = new HashMap();
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
          return nlw.points(el);
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
          tests: agg_tests.values(),
          elements: agg_elements.values(),
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
  var allowNoFilter = (allowNoFilter != undefined ? allowNoFilter==true : false);
  if(!nameOrId && !allowNoFilter)
    throw new Error("You must specify a test filter to use this operation.")
  return nlw.tests().then(r => {
    var tests = r.body;
    if(nameOrId) tests = tests.filter(function(test) {
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
