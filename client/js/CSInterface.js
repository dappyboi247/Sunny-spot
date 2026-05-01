/**
 * CSInterface - Adobe CEP (Common Extensibility Platform) bridge library.
 * Vendored from https://github.com/Adobe-CEP/CSInterface (v11.x)
 * Enables communication between the HTML panel and the ExtendScript host.
 */

var cslib = (function () {

'use strict';

// ── OS types ──────────────────────────────────────────────────────────────

var OSVersion = function (versionStr) {
  this.os = versionStr;
};

// ── Version ───────────────────────────────────────────────────────────────

var Version = function (major, minor, micro, special) {
  this.major   = major   || 0;
  this.minor   = minor   || 0;
  this.micro   = micro   || 0;
  this.special = special || "";
};
Version.INVALID_VERSION_STR = "0.0.0.0";

var VersionBound = function (version, inclusive) {
  this.version   = version;
  this.inclusive = inclusive;
};

var VersionRange = function (lowerBound, upperBound) {
  this.lowerBound = lowerBound;
  this.upperBound = upperBound;
};

// ── Runtime / Host info ───────────────────────────────────────────────────

var Runtime = function (name, versionRange) {
  this.name         = name;
  this.versionRange = versionRange;
};

var HostEnvironment = function (appName, appVersion, appLocale, appUILocale, appId, isAppOnline, appSkinInfo) {
  this.appName      = appName;
  this.appVersion   = appVersion;
  this.appLocale    = appLocale;
  this.appUILocale  = appUILocale;
  this.appId        = appId;
  this.isAppOnline  = isAppOnline;
  this.appSkinInfo  = appSkinInfo;
};

var HostCapabilities = function (EXTENDED_PANEL_MENU, EXTENDED_PANEL_ICONS, DELEGATE_APE_ENGINE, SUPPORT_HTML_EXTENSIONS, DISABLE_FLASH_EXTENSIONS) {
  this.EXTENDED_PANEL_MENU        = EXTENDED_PANEL_MENU;
  this.EXTENDED_PANEL_ICONS       = EXTENDED_PANEL_ICONS;
  this.DELEGATE_APE_ENGINE        = DELEGATE_APE_ENGINE;
  this.SUPPORT_HTML_EXTENSIONS    = SUPPORT_HTML_EXTENSIONS;
  this.DISABLE_FLASH_EXTENSIONS   = DISABLE_FLASH_EXTENSIONS;
};

var ApiVersion = function (major, minor, micro) {
  this.major = major;
  this.minor = minor;
  this.micro = micro;
};

var AppSkinInfo = function (baseFontFamily, baseFontSize, appBarBackgroundColor, panelBackgroundColor, systemHighlightColor) {
  this.baseFontFamily          = baseFontFamily;
  this.baseFontSize            = baseFontSize;
  this.appBarBackgroundColor   = appBarBackgroundColor;
  this.panelBackgroundColor    = panelBackgroundColor;
  this.systemHighlightColor    = systemHighlightColor;
};

var UIColor = function (type, antialiasLevel, color) {
  this.type           = type;
  this.antialiasLevel = antialiasLevel;
  this.color          = color;
};

var RGBColor = function (red, green, blue, alpha) {
  this.red   = red;
  this.green = green;
  this.blue  = blue;
  this.alpha = alpha;
};

// ── Event types ───────────────────────────────────────────────────────────

var CSEvent = function (type, scope, appId, extensionId) {
  this.type        = type;
  this.scope       = scope;
  this.appId       = appId;
  this.extensionId = extensionId;
  this.data        = "";
};

// ── SystemPath ────────────────────────────────────────────────────────────

var SystemPath = {
  APP:            "app",
  EXTENSION:      "extension",
  DESKTOP:        "desktop",
  DOCUMENTS:      "documents",
  PICTURES:       "pictures",
  VIDEOS:         "videos",
  MUSIC:          "music",
  MY_DOCUMENTS:   "myDocuments",
  APPLICATION:    "application",
  USER_DATA:      "userData",
  HOST_APPLICATION: "hostApplication"
};

// ── ColorType ─────────────────────────────────────────────────────────────

var ColorType = { NONE: "none", CUSTOM_UNDEFINED: "customUndefined", DIRECT: "direct" };

// ── CSInterface ───────────────────────────────────────────────────────────

var CSInterface = function () {
  // Detect runtime context
  if (typeof window.__adobe_cep__ !== "undefined") {
    this.__native_interface = window.__adobe_cep__;
  } else {
    // Running outside CEP (e.g. browser preview) – stub out calls
    this.__native_interface = null;
  }
};

CSInterface.ADOBE_CSS_COLOR_CHANGED   = "com.adobe.csxs.events.ThemeColorChanged";
CSInterface.CLOSE_EXTENSION_EVENT     = "com.adobe.csxs.events.closeExtension";

/**
 * evalScript – runs ExtendScript in the host application and returns the
 * result asynchronously via the callback.
 *
 * @param {string}   script   ExtendScript expression to evaluate.
 * @param {Function} callback Called with (result: string) on completion.
 */
CSInterface.prototype.evalScript = function (script, callback) {
  if (!callback || typeof callback !== "function") {
    callback = function () {};
  }
  if (this.__native_interface) {
    this.__native_interface.evalScript(script, callback);
  } else {
    // Stub for non-CEP environments
    console.warn("[CSInterface] evalScript called outside CEP:", script);
    callback("ERROR: Not running inside After Effects.");
  }
};

/**
 * getSystemPath – returns the platform path for a named system folder.
 */
CSInterface.prototype.getSystemPath = function (pathType) {
  if (this.__native_interface) {
    var path = this.__native_interface.getSystemPath(pathType);
    if (path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    return path;
  }
  return "";
};

/**
 * addEventListener – registers a listener for a named CEP event.
 */
CSInterface.prototype.addEventListener = function (type, listener, obj) {
  if (this.__native_interface) {
    this.__native_interface.addEventListener(type, listener, obj);
  }
};

/**
 * removeEventListener – removes a previously registered CEP event listener.
 */
CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  if (this.__native_interface) {
    this.__native_interface.removeEventListener(type, listener, obj);
  }
};

/**
 * dispatchEvent – dispatches a CEP event.
 */
CSInterface.prototype.dispatchEvent = function (event) {
  if (this.__native_interface) {
    if (typeof event.data === "object") {
      event.data = JSON.stringify(event.data);
    }
    this.__native_interface.dispatchEvent(event);
  }
};

/**
 * getHostEnvironment – returns a HostEnvironment object describing the host app.
 */
CSInterface.prototype.getHostEnvironment = function () {
  if (this.__native_interface) {
    return JSON.parse(this.__native_interface.getHostEnvironment());
  }
  return new HostEnvironment("AEFT", "0.0.0", "en_US", "en_US", "AEFT", false, null);
};

/**
 * getExtensionID – returns the extension's own ID string.
 */
CSInterface.prototype.getExtensionID = function () {
  if (this.__native_interface) {
    return this.__native_interface.getExtensionID();
  }
  return "";
};

/**
 * getAPIVersion – returns the CEP API version.
 */
CSInterface.prototype.getAPIVersion = function () {
  if (this.__native_interface) {
    return JSON.parse(this.__native_interface.getAPIVersion());
  }
  return new ApiVersion(11, 0, 0);
};

/**
 * getApplicationID – returns the host application ID (e.g. "AEFT").
 */
CSInterface.prototype.getApplicationID = function () {
  var env = this.getHostEnvironment();
  return env.appId;
};

/**
 * openURLInDefaultBrowser – opens a URL in the system default browser.
 */
CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  if (this.__native_interface) {
    this.__native_interface.openURLInDefaultBrowser(url);
  } else {
    window.open(url, "_blank");
  }
};

/**
 * closeExtension – closes the extension panel.
 */
CSInterface.prototype.closeExtension = function () {
  if (this.__native_interface) {
    this.__native_interface.closeExtension();
  }
};

/**
 * setContextMenu – sets the panel context menu from an XML string.
 */
CSInterface.prototype.setContextMenu = function (menu, callback) {
  if (this.__native_interface) {
    this.__native_interface.setContextMenu(menu, callback);
  }
};

/**
 * updateContextMenuItem – updates a menu item's state.
 */
CSInterface.prototype.updateContextMenuItem = function (menuItemID, enabled, checked) {
  if (this.__native_interface) {
    this.__native_interface.updateContextMenuItem(menuItemID, enabled, checked);
  }
};

/**
 * getHostCapabilities – returns the HostCapabilities for the current host.
 */
CSInterface.prototype.getHostCapabilities = function () {
  if (this.__native_interface) {
    return JSON.parse(this.__native_interface.getHostCapabilities());
  }
  return new HostCapabilities(false, false, false, true, false);
};

/**
 * initResourceBundle – loads and returns the extension's string resources.
 */
CSInterface.prototype.initResourceBundle = function () {
  var resourceBundle = {};
  var extensionPath  = this.getSystemPath(SystemPath.EXTENSION);
  var locale         = this.getHostEnvironment().appUILocale || "en_US";
  // Try locale-specific file, then fall back to "en_US"
  var candidates = [locale, locale.split("_")[0], "en_US"];
  for (var i = 0; i < candidates.length; i++) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", extensionPath + "/locale/" + candidates[i] + "/messages.json", false);
      xhr.send();
      if (xhr.status === 200) {
        resourceBundle = JSON.parse(xhr.responseText);
        break;
      }
    } catch (e) { /* locale file not present */ }
  }
  return resourceBundle;
};

// ── Exports ───────────────────────────────────────────────────────────────

return {
  Version:          Version,
  VersionBound:     VersionBound,
  VersionRange:     VersionRange,
  Runtime:          Runtime,
  HostEnvironment:  HostEnvironment,
  HostCapabilities: HostCapabilities,
  ApiVersion:       ApiVersion,
  AppSkinInfo:      AppSkinInfo,
  UIColor:          UIColor,
  RGBColor:         RGBColor,
  CSEvent:          CSEvent,
  SystemPath:       SystemPath,
  ColorType:        ColorType,
  CSInterface:      CSInterface
};

}());

// Make CSInterface available as a global (matches how CEP panels normally use it)
var CSInterface      = cslib.CSInterface;
var SystemPath       = cslib.SystemPath;
var CSEvent          = cslib.CSEvent;
var ColorType        = cslib.ColorType;
var RGBColor         = cslib.RGBColor;
var AppSkinInfo      = cslib.AppSkinInfo;
var HostEnvironment  = cslib.HostEnvironment;
var ApiVersion       = cslib.ApiVersion;
