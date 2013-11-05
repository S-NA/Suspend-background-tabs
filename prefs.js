/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
let {
	addonRoot, addonName
} = require("info");
let branchName = "extensions." + addonName + ".";
let branch = Services.prefs.getBranch(branchName);
let ignorePrefChanges = false;

function init() {
	// Load default preferences and set up properties for them
	let defaultBranch = Services.prefs.getDefaultBranch(branchName);
	let scope = {
		pref: function(pref, value) {
			if (pref.substr(0, branchName.length) != branchName) {
				Cu.reportError(new Error("Ignoring default preference " + pref + ", wrong branch."));
				return;
			}
			pref = pref.substr(branchName.length);
			let[getter, setter] = typeMap[typeof value];
			setter(defaultBranch, pref, value);
			defineProperty(pref, false, getter, setter);
		}
	};
	Services.scriptloader.loadSubScript(addonRoot + "defaults/preferences/prefs.js", scope);
	// Add preference change observer
	try {
		branch.QueryInterface(Ci.nsIPrefBranch2).addObserver("", Prefs, true);
		onShutdown.add(function() branch.removeObserver("", Prefs));
	} catch (e) {
		Cu.reportError(e);
	}
}
/**
 * Sets up getter/setter on Prefs object for preference.
 */

function defineProperty( /**String*/ name, defaultValue, /**Function*/ readFunc, /**Function*/ writeFunc) {
	let value = defaultValue;
	Prefs["_update_" + name] = function() {
		try {
			value = readFunc(branch, name);
			triggerListeners(name);
		} catch (e) {
			Cu.reportError(e);
		}
	};
	Prefs.__defineGetter__(name, function() value);
	Prefs.__defineSetter__(name, function(newValue) {
		if (value == newValue) return value;
		try {
			ignorePrefChanges = true;
			writeFunc(branch, name, newValue);
			value = newValue;
			triggerListeners(name);
		} catch (e) {
			Cu.reportError(e);
		} finally {
			ignorePrefChanges = false;
		}
		return value;
	});
	Prefs["_update_" + name]();
}
let listeners = [];

function triggerListeners( /**String*/ name) {
	for (let i = 0; i < listeners.length; i++) {
		try {
			listeners[i](name);
		} catch (e) {
			Cu.reportError(e);
		}
	}
}
/**
 * Manages the preferences for an extension, object properties corresponding
 * to extension's preferences are added automatically. Setting the property
 * will automatically change the preference, external preference changes are
 * also recognized automatically.
 */
let Prefs = exports.Prefs = {
	/**
	 * Migrates an old preference to a new name.
	 */
	migrate: function( /**String*/ oldName, /**String*/ newName) {
		if (newName in this && Services.prefs.prefHasUserValue(oldName)) {
			let[getter, setter] = typeMap[typeof this[newName]];
			try {
				this[newName] = getter(Services.prefs, oldName);
			} catch (e) {}
			Services.prefs.clearUserPref(oldName);
		}
	},
	/**
	 * Adds a preferences listener that will be fired whenever a preference
	 * changes.
	 */
	addListener: function( /**Function*/ listener) {
		if (listeners.indexOf(listener) < 0) listeners.push(listener);
	},
	/**
	 * Removes a preferences listener.
	 */
	removeListener: function( /**Function*/ listener) {
		let index = listeners.indexOf(listener);
		if (index >= 0) listeners.splice(index, 1);
	},
	observe: function(subject, topic, data) {
		if (ignorePrefChanges || topic != "nsPref:changed") return;
		if ("_update_" + data in this) this["_update_" + data]();
	},
	QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
};
// Getter/setter functions for difference preference types
let typeMap = {
	boolean: [getBoolPref, setBoolPref],
	number: [getIntPref, setIntPref],
	string: [getCharPref, setCharPref],
	object: [getJSONPref, setJSONPref]
};

function getIntPref(branch, pref) branch.getIntPref(pref)

function setIntPref(branch, pref, newValue) branch.setIntPref(pref, newValue)

function getBoolPref(branch, pref) branch.getBoolPref(pref)

function setBoolPref(branch, pref, newValue) branch.setBoolPref(pref, newValue)

function getCharPref(branch, pref) branch.getComplexValue(pref, Ci.nsISupportsString).data

function setCharPref(branch, pref, newValue) {
	let str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
	str.data = newValue;
	branch.setComplexValue(pref, Ci.nsISupportsString, str);
}

function getJSONPref(branch, pref) JSON.parse(getCharPref(branch, pref))

function setJSONPref(branch, pref, newValue) setCharPref(branch, pref, JSON.stringify(newValue))
init();