#import <Foundation/Foundation.h>
#import <CoreWLAN/CoreWLAN.h>
#include <node_api.h>

napi_value GetSSID(napi_env env, napi_callback_info info) {
  napi_value result;
  
  @autoreleasepool {
    CWWiFiClient *client = [CWWiFiClient sharedWiFiClient];
    CWInterface *iface = [client interface];
    NSString *ssid = [iface ssid];
    
    if (ssid && ssid.length > 0) {
      const char *cstr = [ssid UTF8String];
      napi_create_string_utf8(env, cstr, NAPI_AUTO_LENGTH, &result);
    } else {
      napi_get_null(env, &result);
    }
  }
  
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, nullptr, 0, GetSSID, nullptr, &fn);
  napi_set_named_property(env, exports, "getSSID", fn);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
