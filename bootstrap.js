/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */
const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");
let addonData = null;

function install(params, reason) {}

function uninstall(params, reason) {}

function startup(params, reason) {
	addonData = params;
	if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0) {
		Components.manager.addBootstrappedManifestLocation(params.installPath);
		onShutdown.add(function() Components.manager.removeBootstrappedManifestLocation(params.installPath));
	}
	require("main");
}

function shutdown(params, reason) {
	onShutdown.done = true;
	for (let i = shutdownHandlers.length - 1; i >= 0; i--) {
		try {
			shutdownHandlers[i]();
		} catch (e) {
			Cu.reportError(e);
		}
	}
}
let shutdownHandlers = [];
let onShutdown = {
	done: false,
	add: function(handler) {
		if (shutdownHandlers.indexOf(handler) < 0) shutdownHandlers.push(handler);
	},
	remove: function(handler) {
		let index = shutdownHandlers.indexOf(handler);
		if (index >= 0) shutdownHandlers.splice(index, 1);
	}
};

function require(module) {
	let scopes = require.scopes;
	if (!(module in scopes)) {
		if (module == "info") {
			let applications = {
				"{a23983c0-fd0e-11dc-95ff-0800200c9a66}": "fennec",
				"toolkit@mozilla.org": "toolkit",
				"{ec8030f7-c20a-464f-9b0e-13a3a9e97384}": "firefox",
				"dlm@emusic.com": "emusic",
				"{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}": "seamonkey",
				"{aa3c5121-dab2-40e2-81ca-7ea25febc110}": "fennec2",
				"{a79fe89b-6662-4ff4-8e88-09950ad4dfde}": "conkeror",
				"{aa5ca914-c309-495d-91cf-3141bbb04115}": "midbrowser",
				"songbird@songbirdnest.com": "songbird",
				"prism@developer.mozilla.org": "prism",
				"{3550f703-e582-4d05-9a08-453d09bdfdc6}": "thunderbird"
				"{8de7fcbb-c55c-4fbe-bfc5-fc555c87dbc4}": "palemoon"
			};
			let appID = Services.appinfo.ID;
			scopes[module] = {};
			scopes[module].exports = {
				addonID: addonData.id,
				addonVersion: addonData.version,
				addonRoot: addonData.resourceURI.spec,
				addonName: "suspendbackgroundtabs",
				application: (appID in applications ? applications[appID] : "other"),
			};
		} else {
			scopes[module] = {
				Cc: Cc,
				Ci: Ci,
				Cr: Cr,
				Cu: Cu,
				require: require,
				onShutdown: onShutdown,
				exports: {}
			};
			Services.scriptloader.loadSubScript(addonData.resourceURI.spec + module + ".js", scopes[module]);
		}
	}
	return scopes[module].exports;
}
require.scopes = {
	__proto__: null
};
