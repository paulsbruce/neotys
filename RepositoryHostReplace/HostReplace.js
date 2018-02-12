/*
** Author: Paul Bruce
** Date: 2017-12-18
** Purpose: Remove unnecessary server duplicates from NeoLoad project; occurs
** when original server value is replaced with a variable, subsequent recordings
** re-capture the server host name into a new server.
** Usage:
**  node HostReplace.js --repositoryFilepath ~/neoload_projects/YourProject/config/repository.xml
**                      --hostFind someserver.yourdomain.com
**  [optional]          --hostReplaceWith someotherserver.yourdomain.com
**
** Explanation:
**  Minus the optional parameter, this script will find all references to
**  'someserver.yourdomain.com_1' and replace them with the existing server
**  that matches the same domain (will error early if none exists).
**  With the optional parameter, will do the same as above, but replace with
**  another host name that you specify (will error early if not present).
*/

const fs = require("fs-extra");
const xmldom = require("xmldom");
const xpath = require('xpath');
var select = require('xpath.js')
const argv = require("yargs").argv;

var filePath = argv.repositoryFilepath;
var hostFind = argv.hostFind;
var hostReplaceWith = argv.hostReplaceWith;

if(!fs.pathExistsSync(filePath))
  throw new Error("Value of repositoryFilepath must exist.")

var backupPath = filePath + "" + Date.now() + ".bak";

var oldXml = fs.readFileSync(filePath, 'utf8');

var DOMParser = xmldom.DOMParser;
var doc = new DOMParser().parseFromString(oldXml, 'text/xml');

var dtd_a = oldXml.indexOf("<!DOCTYPE ");
var dtd_b = oldXml.indexOf("]>");
var dtd = oldXml.substring(dtd_a, dtd_b+2);

var findTheReplacement = !(hostReplaceWith && (hostReplaceWith+"").length > 0);
hostReplace = select(doc, "//http-server[@uid='"+(findTheReplacement ? hostFind : hostReplaceWith)+"']");

if(hostReplace.length > 0)
  hostReplaceWith = hostReplace[0].getAttribute('uid');
else {
  if(findTheReplacement)
    throw new Error("No 'hostReplaceWith' argument specified and cannot find a http-server matching a uid value of 'hostFind'")
  else
    throw new Error("Could not find a host in this project that matches the 'hostReplaceWith' value specified.")
}

var iTotalReplacements = 0;

for(var i=0; i<10; i++) {
  var serverUid = hostFind+'_'+i;
  var nodes = select(doc, "//http-action[@serverUid='"+serverUid+"']");
  if(nodes.length > 0) {
    console.log('...replacing references to extraneous host names...')
    for(var j=0; j<nodes.length; j++) {
      var node = nodes[j];
      node.setAttribute('serverUid', hostReplaceWith);
      iTotalReplacements++;
    }
    console.log('nodes: '+nodes.length)
  }
  // having replaced all references to it, remove this node
  var ndServer = select(doc, "//http-server[@uid='"+serverUid+"']");
  if(ndServer.length > 0)
    ndServer[0].parentNode.removeChild(ndServer[0]);
}

if(iTotalReplacements > 0) {
  console.log('constructing new doc')

  var serial = new xmldom.XMLSerializer();
  var newXml = serial.serializeToString(doc);
  console.log("newXml: " + newXml.length)

  newXml = newXml.replace('<!DOCTYPE repository>',dtd);

  if(newXml.indexOf('<!ELEMENT')<0)
    throw new Error('doctype details not preserved')

  fs.copySync(filePath, backupPath);

  fs.writeFileSync(filePath, newXml, {
    mode: parseInt('0755', 8),
    flag: 'w'
  });
} else {
  console.log('no replacements necessary in ' + filePath)
}
