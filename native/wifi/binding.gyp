{
  "targets": [{
    "target_name": "wifi",
    "sources": ["wifi.mm"],
    "xcode_settings": {
      "OTHER_FLAGS": ["-ObjC++"],
      "MACOSX_DEPLOYMENT_TARGET": "13.0"
    },
    "link_settings": {
      "libraries": ["-framework CoreWLAN", "-framework Foundation"]
    },
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
  }]
}
