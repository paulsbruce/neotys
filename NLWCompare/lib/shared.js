module.exports = {
  id: "Logger",
  create: function(options) {
    return new Logger(options);
  }
};

function Logger(options) {
  var lastConsoleLogLineTermination = null;
  const lineTerminationChar = '\n'

  this.log = function(opts) {
    var o = {
      text: (opts != undefined && opts != null && opts.text != undefined) ? opts.text : null,
      after: (opts != undefined && opts != null && opts.after != undefined) ? opts.after : null,
    }
    var beforeLineTermination = '';
    if(lastConsoleLogLineTermination != o.after) {
      if(lastConsoleLogLineTermination != null && lastConsoleLogLineTermination != lineTerminationChar)
        beforeLineTermination = lineTerminationChar
    } else
      beforeLineTermination = o.after

    if(typeof opts == 'string')
      o.text = opts;

    var thisTerminationChar = (o.after != null ? o.after : lineTerminationChar)
    //console.log(JSON.stringify({beforeLineTermination:beforeLineTermination,lastConsoleLogLineTermination:lastConsoleLogLineTermination,thisTerminationChar:thisTerminationChar}))
    lastConsoleLogLineTermination = thisTerminationChar;

    process.stdout.write(
      (beforeLineTermination==null?'':beforeLineTermination) +
      o.text +
      thisTerminationChar
    )
  }
}
