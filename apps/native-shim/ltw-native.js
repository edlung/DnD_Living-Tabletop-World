// The page's side of the native apps' bridge (docs/adr/0070-native-apps.md §2). Both shells
// inject this file at document start in the chosen server's frames, with __LTW_NATIVE_CONFIG__
// replaced by their own description: { platform, app, features }. It installs `window.ltwNative`
// in the main frame only and hands the shell's messages to the page as `ltw-native` events.
(function () {
  'use strict';
  if (window.top !== window || 'ltwNative' in window) return;
  var config = __LTW_NATIVE_CONFIG__;
  var send = null;
  if (config.platform === 'ios') {
    var handlers = window.webkit && window.webkit.messageHandlers;
    var handler = handlers && handlers.ltw;
    if (handler) {
      send = function (text) {
        handler.postMessage(text);
      };
    }
  } else if (config.platform === 'android') {
    var bridge = window.ltwNativeBridge;
    if (bridge) {
      send = function (text) {
        bridge.postMessage(text);
      };
      bridge.onmessage = function (event) {
        receive(event.data);
      };
    }
  }
  if (send === null) return;

  function receive(text) {
    if (typeof text !== 'string') return;
    var detail;
    try {
      detail = JSON.parse(text);
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent('ltw-native', { detail: detail }));
  }

  var shell = Object.freeze({
    version: 1,
    platform: config.platform,
    app: config.app,
    features: Object.freeze(config.features.slice()),
    post: function (message) {
      send(JSON.stringify(message));
    },
  });
  Object.defineProperty(window, 'ltwNative', { value: shell });
  // iOS delivers its messages by calling this; Android through the bridge's `onmessage`.
  Object.defineProperty(window, '__ltwNativeReceive', { value: receive });
})();
