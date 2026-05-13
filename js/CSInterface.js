/**
 * CSInterface.js — Adobe CEP 9 (simplified, self-contained)
 * Full library: https://github.com/Adobe-CEP/CEP-Resources
 */

var SystemPath = {
  USER_DATA:       'userData',
  COMMON_FILES:    'commonFiles',
  MY_DOCUMENTS:    'myDocuments',
  APPLICATION:     'application',
  EXTENSION:       'extension',
  HOST_APPLICATION:'hostApplication'
};

function CSInterface() {
  try {
    this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
  } catch(e) {
    this.hostEnvironment = {};
  }
}

CSInterface.prototype.evalScript = function(script, callback) {
  if (typeof callback !== 'function') callback = function() {};
  try {
    window.__adobe_cep__.evalScript(script, callback);
  } catch(e) {
    callback('EvalScript error.');
  }
};

CSInterface.prototype.openURLInDefaultBrowser = function(url) {
  try {
    if (window.cep && window.cep.util) {
      window.cep.util.openURLInDefaultBrowser(url);
    } else {
      window.__adobe_cep__.openURLInDefaultBrowser(url);
    }
  } catch(e) {}
};

CSInterface.prototype.getSystemPath = function(pathType) {
  try {
    return decodeURI(window.__adobe_cep__.getSystemPath(pathType)).replace(/^file:\/\/\//, '');
  } catch(e) { return ''; }
};

CSInterface.prototype.addEventListener = function(type, listener) {
  try { window.__adobe_cep__.addEventListener(type, listener); } catch(e) {}
};

CSInterface.prototype.getExtensionID = function() {
  try { return window.__adobe_cep__.getExtensionId(); } catch(e) { return ''; }
};
