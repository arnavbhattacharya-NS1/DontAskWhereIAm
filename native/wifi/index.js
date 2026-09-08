try {
  module.exports = require('./build/Release/wifi.node');
} catch(e) {
  module.exports = { getSSID: () => null };
}
