function initWDC() {
    var myConnector = tableau.makeConnector();

    myConnector.getSchema = function (schemaCallback) {

      var tableSchema = {
          id: "neoloadFeed",
          alias: "Neoload Performance Testing Data",
          columns: getSchemaArray()
      };

      schemaCallback([tableSchema]);
    };

    var apiroot = "http://localhost:9094";

    myConnector.getData = function (table, doneCallback) {

      $.getJSON(tableau.connectionData, function(resp) {

          var points = resp.points,
              tableData = [];

          points = points.map(function(p){
            var testName = resp.tests.filter(function(t) { return t.id==p.test; })[0].name;
            var elementName = resp.elements.filter(function(e) { return e.id==p.element; })[0].name;
            p.category = resp.category;
            p.test = testName;
            p.element = elementName;
            return p;
          });

          // Iterate over the JSON object
          for (var i = 0, len = points.length; i < len; i++) {
            var point = points[i];
            var item = {}
            var data = getSchemaArray().map(function(schema) {
              item[schema.id] = point[schema.id];
            });
              tableData.push(item);
          }

          table.appendRows(tableData);
          doneCallback();
      });
    };

    tableau.registerConnector(myConnector);

    $(document).ready(function () {

      $("#submitButton").click(function () {
          tableau.connectionName = "NeoLoad: " + $( "#tests option:selected" ).text();

          var level = $("input[name=level]:checked").val();
          var ep = (level == "TRANSACTION" ? "transactions" : (level == "PAGE") ? "pages" : "requests");
          tableau.connectionData = apiroot + "/" + ep + "?test=" + $( "#tests option:selected" ).val();

          tableau.submit();
      });

      $('#tests').append($("<option/>", { text: '[Select a test]'}));

      $.getJSON("http://localhost:9094/tests", function(resp) {
        var tests = resp.tests;//.filter(function(test) { return test.startDate > 0; });
        $.each(tests, function(key,value) {
          var test = value;
          $('#tests').append($("<option/>", {
              id: test.id,
              value: test.id,
              text: '[' + (test.qualityStatus ? test.qualityStatus : test.status) + '] ' + test.name
          }));
          var option = $("#"+test.id);
          option.data("nl-data",test);
        });
      });

      $('#tests').change(function(val) {
        var option = $(this).find(":selected");
        var test = option.data("nl-data");
        var html = Object.keys(test).map(function(key) { return '<div>'+key+': '+test[key]+'</div>'}).join('');
        $("#testDetails").html(html)
      });
    });



}

function getSchemaArray() {
  var cols = [{
    id: "category",
    dataType: tableau.dataTypeEnum.string
  }, {
    id: "test",
    dataType: tableau.dataTypeEnum.string
  }, {
    id: "element",
    dataType: tableau.dataTypeEnum.string
  }, {
    id: "from",
    dataType: tableau.dataTypeEnum.datetime
  }, {
    id: "to",
    dataType: tableau.dataTypeEnum.datetime
  }, {
    id: "AVG_DURATION",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "MIN_DURATION",
    dataType: tableau.dataTypeEnum.int
  }, {
    id: "MAX_TTFB",
    dataType: tableau.dataTypeEnum.int
  }, {
    id: "ERRORS",
    dataType: tableau.dataTypeEnum.int
  }, {
    id: "COUNT",
    dataType: tableau.dataTypeEnum.int
  }, {
    id: "ELEMENTS_PER_SECOND",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "ERROR_RATE",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "ERRORS_PER_SECOND",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "AVG_DURATION",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "MAX_DURATION",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "AVG_TTFB",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "THROUGHPUT",
    dataType: tableau.dataTypeEnum.float
  }, {
    id: "MIN_TTFB",
    dataType: tableau.dataTypeEnum.int
  }];
  return cols;
}

initWDC();
